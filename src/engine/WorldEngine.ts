import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MlMap, MapMouseEvent, MapTouchEvent, Point } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { bearingDegrees, clamp, distanceMeters, nearestOnSegment, normalizeDegrees } from '../core/geo';
import type {
  Business,
  CameraView,
  Entity3D,
  EntityRef,
  LngLat,
  Place,
  ThemePalette,
  VisualConfig,
  WorldDocument,
} from '../core/types';
import { WORLD_ORIGIN } from '../geo/geography';
import { ROAD_FILL_LAYERS, buildSky, buildStyle, themePaintUpdates } from './mapStyle';
import { placesGeoJson } from './places';
import { ThreeLayer } from './ThreeLayer';

/** Respeta la preferencia del sistema: los vuelos y la órbita se sustituyen por saltos. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export type EditTool = 'select' | 'move' | 'rotate' | 'scale';
export type PickKind = 'place' | 'building' | 'object';
export interface PickResult {
  kind: PickKind;
  id: string;
}

/** Referência transformável no STUDIO: pontos independentes e entidades 3D. */
export type TransformRef = { kind: 'place'; id: string } | EntityRef;

export interface EngineCallbacks {
  onPick: (hit: PickResult | null) => void;
  onView: (v: { bearing: number; pitch: number; zoom: number; center: LngLat }) => void;
  onReady: () => void;
  onMapError: () => void;
  /** STUDIO: transformação em andamento (arraste de entidades 3D ou de pontos). */
  onTransform: (ref: TransformRef, patch: { position?: LngLat; heading?: number; scale?: number }) => void;
  onGestureEnd: () => void;
}

export interface EngineOptions {
  container: HTMLElement;
  mode: 'world' | 'studio';
  visual: VisualConfig;
  theme: string;
  places: Place[];
  initialView?: CameraView;
  /** IDs cuyo marcador no se dibuja en esta instancia (filtro visual, nunca baja del documento). */
  hiddenPlaceIds?: ReadonlySet<string>;
  callbacks: EngineCallbacks;
  /** WORLD sin brújula no necesita el evento `move`; se desactiva para no calcular la vista por frame. */
  emitView?: boolean;
}

interface DragState {
  type: 'move' | 'rotate' | 'scale';
  ref: TransformRef;
  grab: { dLng: number; dLat: number };
  startPoint: Point;
  centerPoint: Point;
  startHeading: number;
  startScale: number;
  startAngle: number;
}

const MARKER_LAYERS = ['places-dot', 'places-label'];

type FC = Parameters<GeoJSONSource['setData']>[0];
const emptyFC = { type: 'FeatureCollection', features: [] } as FC;

/**
 * Motor compartilhado por WORLD e STUDIO: mapa MapLibre + camada 3D (three.js) + marcadores.
 * Não conhece React. O STUDIO apenas liga as ferramentas de edição (`setTool`).
 */
export class WorldEngine {
  readonly map: MlMap;
  private three: ThreeLayer;
  private opts: EngineOptions;
  private theme: ThemePalette;
  private themeName: string;
  private loaded = false;
  private pending: { doc: WorldDocument; showUnpublished: boolean } | null = null;
  private places: Place[] = [];
  private entities = new Map<string, Entity3D>();
  private tool: EditTool = 'select';
  private selection: PickResult | null = null;
  private drag: DragState | null = null;
  private errorCount = 0;
  private errorNotified = false;
  private userLngLat: LngLat | null = null;

  constructor(opts: EngineOptions) {
    this.opts = opts;
    this.places = opts.places;
    this.themeName = opts.theme;
    this.theme = opts.visual.themes[opts.theme] ?? Object.values(opts.visual.themes)[0];
    const v = opts.initialView ?? opts.visual.home;
    this.three = new ThreeLayer(WORLD_ORIGIN);

    this.map = new maplibregl.Map({
      container: opts.container,
      style: buildStyle(this.theme),
      center: v.center,
      zoom: v.zoom,
      pitch: v.pitch,
      bearing: v.bearing,
      minZoom: opts.visual.minZoom,
      maxZoom: opts.visual.maxZoom,
      maxPitch: 75,
      maxBounds: opts.visual.bounds,
      attributionControl: false,
      canvasContextAttributes: { antialias: true },
      fadeDuration: 120,
    });
    (window as unknown as { __map?: MlMap }).__map = this.map;
    // Créditos obligatorios de la cartografía, visibles sin abrir el panel «Acerca de».
    this.map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    this.map.on('load', () => this.onLoad());
    this.map.on('error', (ev) => {
      console.warn('[map]', (ev as { error?: Error }).error?.message ?? ev);
      this.errorCount++;
      if (this.errorCount >= 4 && !this.errorNotified) {
        this.errorNotified = true;
        opts.callbacks.onMapError();
      }
    });
    if (opts.emitView !== false) this.map.on('move', () => this.emitView());
    this.map.on('click', (e) => this.handleClick(e));

    // El gesto ya hace repintar el mapa: la capa 3D no debe encolar frames extra.
    const interacting = (v: boolean) => () => this.three.setInteracting(v);
    this.map.on('touchstart', interacting(true));
    this.map.on('touchmove', interacting(true));
    this.map.on('touchend', interacting(false));
    this.map.on('touchcancel', interacting(false));
    this.map.on('dragend', interacting(false));

    if (this.opts.mode === 'studio') {
      // Estos listeners solo editan entidades en STUDIO; en WORLD no hay arrastre de modelos.
      this.map.on('mousedown', (e) => this.dragStart(e));
      this.map.on('touchstart', (e) => this.dragStart(e));
      this.map.on('mousemove', (e) => this.pointerMove(e));
      this.map.on('touchmove', (e) => this.pointerMove(e));
      this.map.on('mouseup', () => this.dragEnd());
      this.map.on('touchend', () => this.dragEnd());
      this.map.on('touchcancel', () => this.dragEnd());
    } else {
      this.map.on('mousedown', interacting(true));
      this.map.on('mouseup', interacting(false));
      this.map.on('mouseout', interacting(false));
    }
  }

  /* ----------------------------------------- carga ----------------------------------------- */

  private onLoad() {
    const m = this.map;
    const t = this.theme;
    const placeColors = this.opts.visual.placeColors;

    m.addSource('places', {
      type: 'geojson',
      data: placesGeoJson(this.places, placeColors, this.opts.hiddenPlaceIds) as FC,
    });
    m.addSource('selection', { type: 'geojson', data: emptyFC });
    m.addSource('me', { type: 'geojson', data: emptyFC });

    // camada 3D logo abaixo dos rótulos de rua
    m.addLayer(this.three, 'road-label');
    this.three.setTheme(t);

    m.addLayer({
      id: 'places-dot',
      type: 'circle',
      source: 'places',
      minzoom: 13.5,
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          13.5, ['*', 3, ['coalesce', ['get', 'size'], 1]],
          17, ['*', 5.5, ['coalesce', ['get', 'size'], 1]],
        ],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': ['coalesce', ['get', 'strokeColor'], t.halo],
        'circle-opacity': ['coalesce', ['get', 'opacity'], 1],
      },
    });
    m.addLayer({
      id: 'places-label',
      type: 'symbol',
      source: 'places',
      minzoom: 15.2,
      layout: {
        'text-field': ['coalesce', ['get', 'label'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 12,
        'text-anchor': 'top',
        'text-offset': [0, 0.8],
        'text-max-width': 8,
      },
      paint: {
        'text-color': t.text,
        'text-halo-color': t.halo,
        'text-halo-width': 1.6,
        'text-opacity': ['case', ['!=', ['get', 'showLabel'], false], 1, 0],
      },
    });
    m.addLayer({
      id: 'sel-glow',
      type: 'circle',
      source: 'selection',
      paint: { 'circle-radius': 26, 'circle-color': '#ffd166', 'circle-opacity': 0.16, 'circle-blur': 0.8 },
    });
    m.addLayer({
      id: 'sel-ring',
      type: 'circle',
      source: 'selection',
      paint: {
        'circle-radius': 15,
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': '#ffd166',
        'circle-stroke-width': 2.5,
      },
    });
    m.addLayer({
      id: 'me-dot',
      type: 'circle',
      source: 'me',
      paint: {
        'circle-radius': 7,
        'circle-color': '#4da3ff',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 3,
      },
    });

    // cursor de ponteiro sobre marcadores (desktop)
    for (const id of MARKER_LAYERS) {
      m.on('mouseenter', id, () => (m.getCanvas().style.cursor = 'pointer'));
      m.on('mouseleave', id, () => (m.getCanvas().style.cursor = ''));
    }

    this.loaded = true;
    if (this.pending) this.setData(this.pending.doc, { showUnpublished: this.pending.showUnpublished });
    this.setSelection(this.selection);
    if (this.opts.emitView !== false) this.emitView();
    this.opts.callbacks.onReady();
  }

  /* ----------------------------------------- dados ----------------------------------------- */

  /** Atualiza lugares, construções, objetos e marcadores a partir do documento. */
  setData(doc: WorldDocument, o: { showUnpublished: boolean }) {
    if (!this.loaded) {
      this.pending = { doc, showUnpublished: o.showUnpublished };
      return;
    }
    if (doc.places) this.setPlaces(doc.places);
    const bizByBuilding = new Map<string, Business[]>();
    for (const b of doc.businesses) {
      if (!b.buildingId || (!b.published && !o.showUnpublished)) continue;
      const list = bizByBuilding.get(b.buildingId) ?? [];
      list.push(b);
      bizByBuilding.set(b.buildingId, list);
    }
    const labelFor = (e: Entity3D) => {
      const biz = bizByBuilding.get(e.id);
      return biz?.length ? biz[0].name : e.name;
    };

    this.entities.clear();
    const all: Entity3D[] = [...doc.buildings, ...doc.objects];
    all.forEach((e) => this.entities.set(e.id, e));
    this.three.sync(all, labelFor);

    this.refreshSelectionMarker();
  }

  /** Pontos editados no STUDIO: atualiza o GeoJSON e o anel de seleção em tempo real. */
  setPlaces(places: Place[]) {
    this.places = places;
    if (!this.loaded) return;
    // `this.places` conserva la lista completa para selección y búsqueda; el filtro solo
    // afecta a la fuente GeoJSON que dibuja los marcadores.
    (this.map.getSource('places') as GeoJSONSource).setData(
      placesGeoJson(places, this.opts.visual.placeColors, this.opts.hiddenPlaceIds) as FC,
    );
    this.refreshSelectionMarker();
  }

  setTheme(name: string) {
    const t = this.opts.visual.themes[name];
    if (!t) return;
    this.themeName = name;
    this.theme = t;
    if (!this.loaded) return;
    const m = this.map;
    for (const [layer, prop, value] of themePaintUpdates(t)) {
      if (m.getLayer(layer)) m.setPaintProperty(layer, prop as never, value as never);
    }
    m.setSky(buildSky(t) as never);
    for (const id of ['places-label']) {
      m.setPaintProperty(id, 'text-color', t.text);
      m.setPaintProperty(id, 'text-halo-color', t.halo);
    }
    m.setPaintProperty('places-dot', 'circle-stroke-color', ['coalesce', ['get', 'strokeColor'], t.halo]);
    this.three.setTheme(t);
  }

  get currentTheme() {
    return this.themeName;
  }

  /* --------------------------------------- seleção --------------------------------------- */

  setSelection(sel: PickResult | null) {
    this.selection = sel;
    if (!this.loaded) return;
    const ref = sel && sel.kind !== 'place' ? { kind: sel.kind, id: sel.id } : null;
    this.three.setSelection(ref);
    if (this.opts.mode === 'world') this.three.setHover(ref);
    this.refreshSelectionMarker();
  }

  /** Mantiene el pulso de la selección fijo mientras dura una secuencia de cámara (órbita). */
  pinSelectionPulse(pinned: boolean) {
    if (!this.loaded) return;
    const sel = this.selection;
    const ref = pinned && sel && sel.kind !== 'place' ? { kind: sel.kind, id: sel.id } : null;
    this.three.setPulsePinned(ref);
  }

  private refreshSelectionMarker() {
    if (!this.loaded) return;
    const src = this.map.getSource('selection') as GeoJSONSource;
    const pos = this.selectionPosition();
    // No STUDIO o contorno 3D cuida das entidades; pontos usam o mesmo anel do WORLD.
    if (!pos || this.selection?.kind !== 'place') {
      src.setData(emptyFC);
      return;
    }
    src.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [pos.lng, pos.lat] }, properties: {} }],
    });
  }

  private selectionPosition(): LngLat | null {
    const s = this.selection;
    if (!s) return null;
    if (s.kind === 'place') return this.places.find((p) => p.id === s.id)?.position ?? null;
    return this.entities.get(s.id)?.placement.position ?? null;
  }

  /* ----------------------------------------- câmera ----------------------------------------- */

  private emitView() {
    const c = this.map.getCenter();
    this.opts.callbacks.onView({
      bearing: this.map.getBearing(),
      pitch: this.map.getPitch(),
      zoom: this.map.getZoom(),
      center: { lng: c.lng, lat: c.lat },
    });
  }

  getView(): CameraView {
    const c = this.map.getCenter();
    return { center: [c.lng, c.lat], zoom: this.map.getZoom(), pitch: this.map.getPitch(), bearing: this.map.getBearing() };
  }

  setPerspective(mode: '2d' | '3d') {
    this.map.easeTo({ pitch: mode === '3d' ? this.opts.visual.pitch3d : 0, duration: prefersReducedMotion() ? 0 : 800 });
  }

  resetNorth() {
    this.map.easeTo({ bearing: 0, duration: prefersReducedMotion() ? 0 : 600 });
  }

  goHome() {
    const h = this.opts.visual.home;
    const target = { center: h.center, zoom: h.zoom, pitch: this.map.getPitch() > 10 ? h.pitch : 0, bearing: h.bearing };
    if (prefersReducedMotion()) this.map.jumpTo(target);
    else this.map.flyTo({ ...target, duration: 1800, essential: true });
  }

  /** Voo de abertura: do alto até a vista inicial em perspectiva. */
  intro() {
    const h = this.opts.visual.home;
    if (prefersReducedMotion()) {
      this.map.jumpTo({ center: h.center, zoom: h.zoom, pitch: h.pitch, bearing: h.bearing });
      return;
    }
    this.map.jumpTo({ center: h.center, zoom: h.zoom - 2.2, pitch: 0, bearing: 0 });
    this.map.flyTo({ center: h.center, zoom: h.zoom, pitch: h.pitch, bearing: h.bearing, duration: 3200, curve: 1.2, essential: true });
  }

  flyToPoint(p: LngLat, zoom = 18) {
    const target = { center: [p.lng, p.lat] as [number, number], zoom: Math.max(this.map.getZoom(), zoom) };
    if (prefersReducedMotion()) this.map.jumpTo(target);
    else this.map.flyTo({ ...target, duration: 1400, essential: true });
  }

  /** Geolocalização do dispositivo. Mostra o ponto apenas se estiver dentro da área do mapa. */
  locate(): Promise<'ok' | 'denied' | 'outside' | 'unsupported'> {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) return resolve('unsupported');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p = { lng: pos.coords.longitude, lat: pos.coords.latitude };
          const [[w, s], [e, n]] = this.opts.visual.bounds;
          if (p.lng < w || p.lng > e || p.lat < s || p.lat > n) return resolve('outside');
          this.userLngLat = p;
          (this.map.getSource('me') as GeoJSONSource).setData({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: {} }],
          });
          this.flyToPoint(p, 17.5);
          resolve('ok');
        },
        () => resolve('denied'),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 },
      );
    });
  }

  get hasUserLocation() {
    return !!this.userLngLat;
  }

  resize() {
    this.map.resize();
  }

  destroy() {
    if ((window as unknown as { __map?: MlMap }).__map === this.map) {
      delete (window as unknown as { __map?: MlMap }).__map;
    }
    this.map.remove();
  }

  /* ------------------------------------- picking / cliques ------------------------------------- */

  private pickAt(point: Point): PickResult | null {
    const m = this.map;
    const r = 12;
    const layers = MARKER_LAYERS.filter((l) => m.getLayer(l));
    const feats = m.queryRenderedFeatures([[point.x - r, point.y - r], [point.x + r, point.y + r]], { layers });
    const studio = this.opts.mode === 'studio';
    // 3D primeiro quando o clique cai no corpo do modelo (no STUDIO, objetos também)
    const hit = this.three.pick(point);
    if (hit) {
      if (studio || hit.kind === 'building') return { kind: hit.kind, id: hit.id };
    }
    for (const f of feats) {
      const id = f.properties?.id as string | undefined;
      if (!id) continue;
      if (f.layer.id.startsWith('places')) return { kind: 'place', id };
      return { kind: 'building', id };
    }
    return null;
  }

  private handleClick(e: MapMouseEvent) {
    if (this.dragMoved) {
      this.dragMoved = false;
      return;
    }
    this.opts.callbacks.onPick(this.pickAt(e.point));
  }

  /* --------------------------------- edição (STUDIO) --------------------------------- */

  setTool(tool: EditTool) {
    this.tool = tool;
  }

  private dragMoved = false;

  private dragStart(e: MapMouseEvent | MapTouchEvent) {
    if (this.opts.mode !== 'studio' || this.tool === 'select' || !this.selection) return;
    if ('points' in e && e.points.length > 1) return;
    const sel = this.selection;
    if (sel.kind === 'place') {
      // Pontos só se movem com a ferramenta "mover"; o marcador é um círculo, sem rotação/escala.
      if (this.tool !== 'move') return;
      const place = this.places.find((p) => p.id === sel.id);
      if (!place) return;
      const screen = this.map.project([place.position.lng, place.position.lat]);
      if (Math.hypot(e.point.x - screen.x, e.point.y - screen.y) > 18) return;
      e.preventDefault();
      this.map.dragPan.disable();
      this.map.touchZoomRotate.disable();
      this.dragMoved = false;
      this.drag = {
        type: 'move',
        ref: { kind: 'place', id: place.id },
        grab: { dLng: e.lngLat.lng - place.position.lng, dLat: e.lngLat.lat - place.position.lat },
        startPoint: e.point,
        centerPoint: screen,
        startHeading: 0,
        startScale: 1,
        startAngle: 0,
      };
      return;
    }
    const ent = this.entities.get(sel.id);
    if (!ent) return;
    const near = distanceMeters(e.lngLat, ent.placement.position) <= this.three.radiusOf(ent) + 2.5;
    const hit = this.three.pick(e.point);
    if (!near && !(hit && hit.id === ent.id)) return;

    e.preventDefault();
    this.map.dragPan.disable();
    this.map.touchZoomRotate.disable();
    const center = this.map.project([ent.placement.position.lng, ent.placement.position.lat]);
    this.dragMoved = false;
    this.drag = {
      type: this.tool === 'move' ? 'move' : this.tool === 'rotate' ? 'rotate' : 'scale',
      ref: { kind: ent.kind, id: ent.id },
      grab: { dLng: e.lngLat.lng - ent.placement.position.lng, dLat: e.lngLat.lat - ent.placement.position.lat },
      startPoint: e.point,
      centerPoint: center,
      startHeading: ent.placement.heading,
      startScale: ent.placement.scale,
      startAngle: Math.atan2(e.point.y - center.y, e.point.x - center.x),
    };
  }

  private pointerMove(e: MapMouseEvent | MapTouchEvent) {
    const d = this.drag;
    if (!d) return;
    if (Math.hypot(e.point.x - d.startPoint.x, e.point.y - d.startPoint.y) > 3) this.dragMoved = true;
    const cb = this.opts.callbacks.onTransform;
    if (d.type === 'move') {
      cb(d.ref, { position: { lng: e.lngLat.lng - d.grab.dLng, lat: e.lngLat.lat - d.grab.dLat } });
    } else if (d.type === 'rotate') {
      const a = Math.atan2(e.point.y - d.centerPoint.y, e.point.x - d.centerPoint.x);
      const delta = ((a - d.startAngle) * 180) / Math.PI;
      cb(d.ref, { heading: Math.round(normalizeDegrees(d.startHeading + delta)) });
    } else {
      const dy = d.startPoint.y - e.point.y;
      cb(d.ref, { scale: Math.round(clamp(d.startScale * Math.exp(dy / 160), 0.3, 4) * 100) / 100 });
    }
  }

  private dragEnd() {
    if (!this.drag) return;
    this.drag = null;
    this.map.dragPan.enable();
    this.map.touchZoomRotate.enable();
    this.opts.callbacks.onGestureEnd();
    // mantém dragMoved=true até o 'click' que o navegador dispara depois do mouseup
    window.setTimeout(() => (this.dragMoved = false), 50);
  }

  /** Rumo para a fachada da entidade ficar voltada para a rua renderizada mais próxima. */
  alignToNearestRoad(id: string): number | null {
    const ent = this.entities.get(id);
    if (!ent || !this.loaded) return null;
    const pos = ent.placement.position;
    const c = this.map.project([pos.lng, pos.lat]);
    const R = 220;
    const layers = ROAD_FILL_LAYERS.filter((l) => this.map.getLayer(l));
    const feats = this.map.queryRenderedFeatures([[c.x - R, c.y - R], [c.x + R, c.y + R]], { layers });
    let best: { point: LngLat; distance: number } | null = null;
    const visit = (coords: number[][]) => {
      for (let i = 0; i < coords.length - 1; i++) {
        const n = nearestOnSegment(pos, { lng: coords[i][0], lat: coords[i][1] }, { lng: coords[i + 1][0], lat: coords[i + 1][1] });
        if (!best || n.distance < best.distance) best = n;
      }
    };
    for (const f of feats) {
      const g = f.geometry;
      if (g.type === 'LineString') visit(g.coordinates);
      else if (g.type === 'MultiLineString') g.coordinates.forEach(visit);
    }
    const b = best as { point: LngLat; distance: number } | null;
    if (!b || b.distance < 0.5) return null;
    return Math.round(bearingDegrees(pos, b.point));
  }

  /** Centro atual do mapa (para inserir novos objetos). */
  getCenter(): LngLat {
    const c = this.map.getCenter();
    return { lng: c.lng, lat: c.lat };
  }
}
