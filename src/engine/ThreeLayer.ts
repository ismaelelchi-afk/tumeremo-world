import * as THREE from 'three';
import maplibregl from 'maplibre-gl';
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap, MapMouseEvent } from 'maplibre-gl';
import { hashString } from '../core/ids';
import { getModel } from '../data/models';
import type { Entity3D, EntityRef, LngLat, ModelParams, ThemePalette } from '../core/types';
import { buildGlb } from './models/glb';
import { buildProcedural, disposeObject } from './models/procedural';

interface Rec {
  key: string;
  outer: THREE.Group;
  entity: Entity3D;
  /** Animaciones del modelo, recogidas una sola vez al construir (evita `traverse` por frame). */
  ticks: Array<(t: number) => void>;
}

/** Halo del indicador: centro transparente para no dibujar un disco dentro de la estructura. */
function hoverHaloTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.8, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Camada personalizada do MapLibre que desenha as construções/objetos com three.js.
 * Cena em metros, relativa a `origin` (X leste, Y norte, Z cima). A matriz final é composta em
 * precisão dupla (mainMatrix × translação × escala) para não tremer em zoom alto.
 */
export class ThreeLayer implements CustomLayerInterface {
  id = 'world-3d';
  type = 'custom' as const;
  renderingMode = '3d' as const;

  private map!: MlMap;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private ambient = new THREE.AmbientLight('#ffffff', 1);
  private sun = new THREE.DirectionalLight('#ffffff', 1);
  private records = new Map<string, Rec>();
  private originMc: maplibregl.MercatorCoordinate;
  private meter: number;
  private M = new THREE.Matrix4();
  private L = new THREE.Matrix4();
  private raycaster = new THREE.Raycaster();
  private hasMatrix = false;
  private glow = 1;
  private selected: EntityRef | null = null;
  private selHelper = new THREE.Group();
  private selMat = new THREE.LineBasicMaterial({ color: '#ffd166', depthTest: false, transparent: true });
  private selFill = new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.16, depthTest: false, depthWrite: false });
  /** Indicador de enfoque por hover: anillo, onda y halo sobre el suelo (Tumeremo.com). */
  private hovered: EntityRef | null = null;
  private hoverHelper = new THREE.Group();
  private ring: THREE.Mesh;
  private ripple: THREE.Mesh;
  private halo: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private rippleMat: THREE.MeshBasicMaterial;
  private haloMat: THREE.MeshBasicMaterial;
  private haloTexture: THREE.CanvasTexture;
  /** Mientras una secuencia de cámara fija el pulso, el puntero no puede moverlo ni apagarlo. */
  private pulsePinned: EntityRef | null = null;
  private onPointerMove = (e: MapMouseEvent) => {
    if (this.pulsePinned) return;
    this.setHover(this.pick(e.point));
  };
  private onPointerOut = () => {
    if (this.pulsePinned) return;
    this.setHover(null);
  };
  private lastRepaint = 0;
  private t0 = performance.now();
  /** Durante un gesto MapLibre ya repinta: no encolamos frames extra desde aquí. */
  private interacting = false;
  onResourceLoaded: () => void = () => this.map?.triggerRepaint();

  constructor(origin: LngLat) {
    this.originMc = maplibregl.MercatorCoordinate.fromLngLat(origin);
    this.meter = this.originMc.meterInMercatorCoordinateUnits();
    this.L.makeTranslation(this.originMc.x, this.originMc.y, 0).scale(new THREE.Vector3(this.meter, -this.meter, this.meter));
    this.sun.position.set(-60, -80, 110);
    this.scene.add(this.ambient, this.sun, this.selHelper);
    this.selHelper.visible = false;

    // Indicador original: geometrías, alturas y renderOrder del marcador de Tumeremo.com.
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64), this.ringMat);
    this.rippleMat = this.ringMat.clone();
    this.ripple = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64), this.rippleMat);
    this.haloTexture = hoverHaloTexture();
    this.haloMat = new THREE.MeshBasicMaterial({
      map: this.haloTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.6,
    });
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.haloMat);
    for (const m of [this.ring, this.ripple, this.halo]) {
      m.frustumCulled = false;
      m.renderOrder = 3;
      m.raycast = () => {};
      this.hoverHelper.add(m);
    }
    this.hoverHelper.visible = false;
    this.scene.add(this.hoverHelper);
  }

  onAdd(map: MlMap, gl: WebGL2RenderingContext | WebGLRenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.raycaster.camera = this.camera;
    map.on('mousemove', this.onPointerMove);
    map.on('mouseout', this.onPointerOut);
  }

  onRemove() {
    this.map?.off('mousemove', this.onPointerMove);
    this.map?.off('mouseout', this.onPointerOut);
    this.records.forEach((r) => disposeObject(r.outer));
    this.records.clear();
    this.clearSelectionGeometries();
    this.selMat.dispose();
    this.selFill.dispose();
    disposeObject(this.hoverHelper);
    this.haloTexture.dispose();
    this.renderer?.dispose();
  }

  /** MapLibre llama a esto durante el gesto; evita repeticiones de repintado por frame. */
  setInteracting(value: boolean) {
    if (this.interacting === value) return;
    this.interacting = value;
    if (!value) this.map?.triggerRepaint();
  }

  render(_gl: WebGL2RenderingContext | WebGLRenderingContext, args: CustomRenderMethodInput) {
    this.M.fromArray(args.defaultProjectionData.mainMatrix as unknown as ArrayLike<number>);
    this.camera.projectionMatrix.multiplyMatrices(this.M, this.L);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.hasMatrix = true;

    const t = (performance.now() - this.t0) / 1000;
    let animated = this.selHelper.visible || this.hovered !== null;
    for (const rec of this.records.values()) {
      for (const tick of rec.ticks) {
        tick(t);
        animated = true;
      }
    }
    if (this.selHelper.visible) {
      this.selMat.opacity = 0.65 + 0.35 * Math.sin(t * 4);
    }
    if (this.hovered) this.updateHover(t);

    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);

    if (animated && !this.interacting) {
      const now = performance.now();
      if (now - this.lastRepaint > 30) {
        this.lastRepaint = now;
        this.map.triggerRepaint();
      } else {
        requestAnimationFrame(() => this.map.triggerRepaint());
      }
    }
  }

  /* ---------------------------------------- cena ---------------------------------------- */

  private toScene(p: LngLat): [number, number] {
    const mc = maplibregl.MercatorCoordinate.fromLngLat(p);
    return [(mc.x - this.originMc.x) / this.meter, -(mc.y - this.originMc.y) / this.meter];
  }

  private buildOuter(e: Entity3D, label: string): THREE.Group | null {
    const def = getModel(e.modelId);
    if (!def) return null;
    const seed = hashString(e.id) % 6;
    const inner =
      def.source.type === 'procedural'
        ? buildProcedural(def.source.recipe, e.params, { label, seed })
        : buildGlb(def.source.url, e.params, this.onResourceLoaded);
    const model = new THREE.Group();
    model.rotation.x = Math.PI / 2; // local Y-up → mundo Z-up
    model.add(inner);
    const outer = new THREE.Group();
    outer.add(model);
    outer.userData.radius = (inner.userData.radius as number) ?? 5;
    return outer;
  }

  private place(outer: THREE.Group, e: Entity3D) {
    const [x, y] = this.toScene(e.placement.position);
    outer.position.set(x, y, 0);
    outer.rotation.z = THREE.MathUtils.degToRad(180 - e.placement.heading);
    outer.scale.setScalar(e.placement.scale);
  }

  /** Sincroniza a cena com a lista de entidades (cria, atualiza transformação, reconstrói ou remove). */
  sync(entities: Entity3D[], labelFor: (e: Entity3D) => string) {
    const seen = new Set<string>();
    for (const e of entities) {
      if (!e.visible) continue;
      const label = getModel(e.modelId)?.hasSign ? labelFor(e) : '';
      const key = `${e.modelId}|${JSON.stringify(e.params)}|${label}`;
      let rec = this.records.get(e.id);
      if (!rec || rec.key !== key) {
        if (rec) {
          this.scene.remove(rec.outer);
          disposeObject(rec.outer);
        }
        const outer = this.buildOuter(e, label);
        if (!outer) continue;
        outer.userData.ref = { kind: e.kind, id: e.id } satisfies EntityRef;
        const ticks: Array<(t: number) => void> = [];
        outer.traverse((o) => {
          const tick = o.userData.tick as ((t: number) => void) | undefined;
          if (tick) ticks.push(tick);
        });
        this.scene.add(outer);
        this.applyGlowTo(outer);
        rec = { key, outer, entity: e, ticks };
        this.records.set(e.id, rec);
      }
      rec.entity = e;
      this.place(rec.outer, e);
      seen.add(e.id);
    }
    for (const [id, rec] of this.records) {
      if (!seen.has(id)) {
        this.scene.remove(rec.outer);
        disposeObject(rec.outer);
        this.records.delete(id);
      }
    }
    this.updateHelper();
    this.map?.triggerRepaint();
  }

  setTheme(t: ThemePalette) {
    this.ambient.color.set(t.ambient);
    this.ambient.intensity = t.ambientIntensity * Math.PI;
    this.sun.color.set(t.sun);
    this.sun.intensity = t.sunIntensity * Math.PI;
    this.glow = t.glow;
    this.applyGlowTo(this.scene);
    this.map?.triggerRepaint();
  }

  private applyGlowTo(root: THREE.Object3D) {
    const glow = this.glow;
    root.traverse((o) => {
      const mats = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!mats) return;
      for (const m of Array.isArray(mats) ? mats : [mats]) {
        const ud = m.userData;
        if (ud.glow !== undefined) (m as THREE.MeshLambertMaterial).emissiveIntensity = glow * ud.glow;
        if (ud.glowBasic) (m as THREE.MeshBasicMaterial).color.copy(ud.glowBasic as THREE.Color).multiplyScalar(0.5 + 0.5 * glow);
        if (ud.night !== undefined) {
          m.opacity = ud.night * glow;
          o.visible = glow > 0.02;
        }
      }
    });
  }

  /* ------------------------------------- seleção (STUDIO) ------------------------------------- */

  setSelection(ref: EntityRef | null) {
    this.selected = ref;
    this.updateHelper();
    this.map?.triggerRepaint();
  }

  /** Las geometrías del helper se crean en cada selección: hay que liberarlas antes de limpiar. */
  private clearSelectionGeometries() {
    this.selHelper.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
    });
    this.selHelper.clear();
  }

  private updateHelper() {
    this.clearSelectionGeometries();
    const rec = this.selected ? this.records.get(this.selected.id) : undefined;
    if (!rec) {
      this.selHelper.visible = false;
      return;
    }
    const p: ModelParams = rec.entity.params;
    const k = rec.entity.placement.scale;
    const hw = (p.width * k) / 2 + 0.8;
    const hd = (p.depth * k) / 2 + 0.8;
    const loop = (pts: Array<[number, number]>) => {
      const g = new THREE.BufferGeometry().setFromPoints(pts.map(([x, y]) => new THREE.Vector3(x, y, 0.2)));
      const l = new THREE.LineLoop(g, this.selMat);
      l.renderOrder = 999;
      l.raycast = () => {};
      return l;
    };
    this.selHelper.add(
      loop([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]),
      loop([[-hw - 0.25, -hd - 0.25], [hw + 0.25, -hd - 0.25], [hw + 0.25, hd + 0.25], [-hw - 0.25, hd + 0.25]]),
      // seta da fachada (frente = -Y no referencial local da entidade)
      loop([[-1, -hd - 0.4], [1, -hd - 0.4], [0, -hd - 2.2]]),
    );
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, hd * 2), this.selFill);
    fill.position.z = 0.12;
    fill.renderOrder = 998;
    fill.raycast = () => {};
    this.selHelper.add(fill);
    this.selHelper.position.copy(rec.outer.position);
    this.selHelper.rotation.z = rec.outer.rotation.z;
    this.selHelper.visible = true;
  }

  /* ----------------------------------------- hover ----------------------------------------- */

  /** Fija el pulso durante una órbita; el movimiento del puntero deja de alterarlo. */
  setPulsePinned(ref: EntityRef | null) {
    this.pulsePinned = ref;
    if (ref) this.setHover(ref);
  }

  /** Entidad bajo el cursor: enciende o desplaza el indicador; `null` lo oculta. */
  setHover(ref: EntityRef | null) {
    if (this.hovered?.id === ref?.id) return;
    this.hovered = ref;
    const rec = ref ? this.records.get(ref.id) : undefined;
    this.hoverHelper.visible = !!rec;
    if (rec) {
      const color = new THREE.Color(rec.entity.params.accentColor);
      this.ringMat.color.copy(color);
      this.rippleMat.color.copy(color);
      this.haloMat.color.copy(color);
      this.updateHover((performance.now() - this.t0) / 1000);
    }
    this.map?.triggerRepaint();
  }

  /** Anillo, onda y halo sobre el suelo, siguiendo a la entidad señalada. */
  private updateHover(t: number) {
    const rec = this.hovered ? this.records.get(this.hovered.id) : undefined;
    if (!rec) {
      this.setHover(null);
      return;
    }
    const { x, y } = rec.outer.position;
    this.ring.position.set(x, y, 0.04);
    this.ripple.position.set(x, y, 0.04);
    this.halo.position.set(x, y, 0.035);

    const p: ModelParams = rec.entity.params;
    const s = Math.max(p.width, p.depth) * rec.entity.placement.scale * 0.85 + 1.2;
    this.ring.scale.setScalar(s);
    this.halo.scale.setScalar(s * 2.4);

    const pulse = (Math.sin(t * 3.2) + 1) / 2;
    this.ringMat.opacity = 0.65 + pulse * 0.35;
    const r = (t * 0.6) % 1;
    this.ripple.scale.setScalar(this.ring.scale.x * (1 + r * 0.7));
    this.rippleMat.opacity = (1 - r) * 0.7;
    this.haloMat.opacity = 0.35 + pulse * 0.25;
  }

  /* ---------------------------------------- picking ---------------------------------------- */

  /** Entidade sob o ponto da tela (px relativos ao canvas), ou null. */
  pick(point: { x: number; y: number }): EntityRef | null {
    if (!this.hasMatrix) return null;
    const c = this.map.getCanvas();
    const nx = (point.x / c.clientWidth) * 2 - 1;
    const ny = -((point.y / c.clientHeight) * 2 - 1);
    const inv = this.camera.projectionMatrixInverse;
    const near = new THREE.Vector3(nx, ny, -1).applyMatrix4(inv);
    const far = new THREE.Vector3(nx, ny, 1).applyMatrix4(inv);
    this.raycaster.set(near, far.sub(near).normalize());
    this.raycaster.far = Infinity;
    const groups = [...this.records.values()].map((r) => r.outer);
    const hits = this.raycaster.intersectObjects(groups, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.ref) o = o.parent;
      if (o) return o.userData.ref as EntityRef;
    }
    return null;
  }

  /** Raio (m) do entorno clicável de uma entidade (para arrastar com tolerância). */
  radiusOf(e: Entity3D): number {
    return (Math.hypot(e.params.width, e.params.depth) / 2) * e.placement.scale;
  }
}
