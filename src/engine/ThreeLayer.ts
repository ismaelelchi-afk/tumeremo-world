import * as THREE from 'three';
import maplibregl from 'maplibre-gl';
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';
import { hashString } from '../core/ids';
import { getModel } from '../data/models';
import type { Entity3D, EntityRef, LngLat, ModelParams, ThemePalette } from '../core/types';
import { buildGlb } from './models/glb';
import { buildProcedural, disposeObject } from './models/procedural';

interface Rec {
  key: string;
  outer: THREE.Group;
  entity: Entity3D;
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
  private lastRepaint = 0;
  private t0 = performance.now();
  onResourceLoaded: () => void = () => this.map?.triggerRepaint();

  constructor(origin: LngLat) {
    this.originMc = maplibregl.MercatorCoordinate.fromLngLat(origin);
    this.meter = this.originMc.meterInMercatorCoordinateUnits();
    this.L.makeTranslation(this.originMc.x, this.originMc.y, 0).scale(new THREE.Vector3(this.meter, -this.meter, this.meter));
    this.sun.position.set(-60, -80, 110);
    this.scene.add(this.ambient, this.sun, this.selHelper);
    this.selHelper.visible = false;
  }

  onAdd(map: MlMap, gl: WebGL2RenderingContext | WebGLRenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.raycaster.camera = this.camera;
  }

  onRemove() {
    this.records.forEach((r) => disposeObject(r.outer));
    this.records.clear();
    this.renderer?.dispose();
  }

  render(_gl: WebGL2RenderingContext | WebGLRenderingContext, args: CustomRenderMethodInput) {
    this.M.fromArray(args.defaultProjectionData.mainMatrix as unknown as ArrayLike<number>);
    this.camera.projectionMatrix.multiplyMatrices(this.M, this.L);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.hasMatrix = true;

    const t = (performance.now() - this.t0) / 1000;
    let animated = this.selHelper.visible;
    this.scene.traverse((o) => {
      const tick = o.userData.tick as ((t: number) => void) | undefined;
      if (tick) {
        tick(t);
        animated = true;
      }
    });
    if (this.selHelper.visible) {
      this.selMat.opacity = 0.65 + 0.35 * Math.sin(t * 4);
    }

    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);

    if (animated) {
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
        this.scene.add(outer);
        this.applyGlowTo(outer);
        rec = { key, outer, entity: e };
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

  private updateHelper() {
    this.selHelper.clear();
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
