/**
 * Persistência. `WorldRepository` é o contrato que um backend futuro deverá implementar
 * (autenticação, versionamento, publicação). Hoje existe apenas a implementação local.
 */
import placesJson from '../data/places.json';
import seedJson from '../data/seed.json';
import { getModel } from '../data/models';
import { sanitizeLocalized } from '../i18n/localized';
import { translate } from '../i18n/translate';
import { PLACE_CATEGORIES, PLACE_ICON_BY_CATEGORY, PLACE_ICONS } from './labels';
import type {
  Business,
  CustomBuilding,
  ModelParams,
  Place,
  PlaceCategory,
  PlaceIcon,
  WorldDocument,
  WorldObject3D,
} from './types';

export interface WorldRepository {
  /** Rascunho salvo, ou null se não existir. */
  load(): Promise<WorldDocument | null>;
  save(doc: WorldDocument): Promise<void>;
  clear(): Promise<void>;
}

export const STORAGE_KEY = 'tumeremo-world:document:v1';

export class LocalStorageRepository implements WorldRepository {
  constructor(private key: string = STORAGE_KEY) {}

  async load(): Promise<WorldDocument | null> {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      return validateDocument(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async save(doc: WorldDocument): Promise<void> {
    localStorage.setItem(this.key, JSON.stringify(doc));
  }

  async clear(): Promise<void> {
    localStorage.removeItem(this.key);
  }
}

export const repository: WorldRepository = new LocalStorageRepository();

export function seedDocument(): WorldDocument {
  const doc = JSON.parse(JSON.stringify(seedJson)) as WorldDocument;
  return { ...doc, places: SEED_PLACES.map((p) => ({ ...p, position: { ...p.position } })) };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const rec = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** Os 14 lugares originais, com os novos campos editáveis preenchidos. Nunca lidos de localStorage. */
export const SEED_PLACES: Place[] = (placesJson as unknown as Array<Omit<Place, 'visible' | 'icon'>>).map((p) => ({
  ...p,
  visible: true,
  icon: PLACE_ICON_BY_CATEGORY[p.category] ?? 'pin',
}));

const CATEGORIES = new Set<string>(PLACE_CATEGORIES);
const ICONS = new Set<string>(PLACE_ICONS);
const SEED_BY_ID = new Map(SEED_PLACES.map((p) => [p.id, p]));

function sanitizeParams(raw: unknown, modelId: string): ModelParams | null {
  const model = getModel(modelId);
  if (!model) return null;
  const r = rec(raw) ?? {};
  const d = model.defaults;
  return {
    width: isNum(r.width) ? r.width : d.width,
    depth: isNum(r.depth) ? r.depth : d.depth,
    height: isNum(r.height) ? r.height : d.height,
    wallColor: isStr(r.wallColor) ? r.wallColor : d.wallColor,
    roofColor: isStr(r.roofColor) ? r.roofColor : d.roofColor,
    accentColor: isStr(r.accentColor) ? r.accentColor : d.accentColor,
  };
}

function sanitizePlacement(raw: unknown) {
  const r = rec(raw);
  const pos = rec(r?.position);
  if (!r || !pos || !isNum(pos.lng) || !isNum(pos.lat)) return null;
  return {
    position: { lng: pos.lng, lat: pos.lat },
    heading: isNum(r.heading) ? r.heading : 0,
    scale: isNum(r.scale) && r.scale > 0 ? r.scale : 1,
  };
}

/** Preserva a fonte original (OSM/manual) e usa a seed apenas como referência. */
function sanitizePlace(raw: unknown): Place | null {
  const p = rec(raw);
  if (!p || !isStr(p.id)) return null;
  const base = SEED_BY_ID.get(p.id);
  const pos = rec(p.position);
  const position = pos && isNum(pos.lng) && isNum(pos.lat) ? { lng: pos.lng, lat: pos.lat } : base?.position;
  if (!position) return null;

  const category: PlaceCategory =
    isStr(p.category) && CATEGORIES.has(p.category) ? (p.category as PlaceCategory) : base?.category ?? 'other';
  const icon: PlaceIcon = isStr(p.icon) && ICONS.has(p.icon) ? (p.icon as PlaceIcon) : base?.icon ?? PLACE_ICON_BY_CATEGORY[category];
  const name = isStr(p.name) && p.name.trim() ? p.name : base?.name ?? translate('default.place');
  const description = isStr(p.description) ? p.description : base?.description;
  const src = rec(p.source);
  const source: Place['source'] =
    src?.type === 'osm' && isStr(src.layer) && isStr(src.subclass)
      ? { type: 'osm', layer: src.layer, subclass: src.subclass }
      : src?.type === 'manual' && isStr(src.note)
        ? { type: 'manual', note: src.note }
        : base?.source ?? { type: 'manual', note: translate('default.origin') };
  const i18n = sanitizeLocalized(p.i18n);

  return {
    id: p.id,
    name,
    category,
    position,
    ...(description !== undefined ? { description } : {}),
    ...(i18n ? { i18n } : {}),
    source,
    visible: typeof p.visible === 'boolean' ? p.visible : base?.visible ?? true,
    icon,
  };
}

/** Reconcilia o documento com a seed: edições prevalecem, lugares ausentes são restaurados, sem duplicatas. */
function sanitizePlaces(raw: unknown): Place[] {
  const merged = new Map<string, Place>();
  for (const item of Array.isArray(raw) ? raw : []) {
    const place = sanitizePlace(item);
    if (place && !merged.has(place.id)) merged.set(place.id, place);
  }
  for (const seed of SEED_PLACES) {
    if (!merged.has(seed.id)) merged.set(seed.id, { ...seed, position: { ...seed.position } });
  }
  const seedIds = new Set(SEED_PLACES.map((p) => p.id));
  return [
    ...SEED_PLACES.map((seed) => merged.get(seed.id)!),
    ...[...merged.values()].filter((p) => !seedIds.has(p.id)),
  ];
}

/**
 * Valida e normaliza um documento desconhecido (rascunho local ou arquivo importado).
 * Migración segura: cualquier número de versión se normaliza a 1 sin descartar el documento.
 * Los bloques `i18n` se copian explícitamente para sobrevivir a guardar/importar/exportar.
 */
export function validateDocument(raw: unknown): WorldDocument | null {
  const r = rec(raw);
  if (!r) return null;
  const buildings: CustomBuilding[] = [];
  const objects: WorldObject3D[] = [];
  const businesses: Business[] = [];

  for (const item of Array.isArray(r.buildings) ? r.buildings : []) {
    const b = rec(item);
    if (!b || !isStr(b.id) || !isStr(b.modelId)) continue;
    const placement = sanitizePlacement(b.placement);
    const params = sanitizeParams(b.params, b.modelId);
    if (!placement || !params) continue;
    const i18n = sanitizeLocalized(b.i18n);
    buildings.push({
      id: b.id,
      kind: 'building',
      name: isStr(b.name) ? b.name : translate('default.building'),
      modelId: b.modelId,
      placement,
      params,
      description: isStr(b.description) ? b.description : '',
      placeId: isStr(b.placeId) ? b.placeId : null,
      visible: b.visible !== false,
      origin: b.origin === 'demo' ? 'demo' : 'studio',
      ...(i18n ? { i18n } : {}),
    });
  }
  for (const item of Array.isArray(r.objects) ? r.objects : []) {
    const o = rec(item);
    if (!o || !isStr(o.id) || !isStr(o.modelId)) continue;
    const placement = sanitizePlacement(o.placement);
    const params = sanitizeParams(o.params, o.modelId);
    if (!placement || !params) continue;
    const i18n = sanitizeLocalized(o.i18n);
    objects.push({
      id: o.id,
      kind: 'object',
      name: isStr(o.name) ? o.name : translate('default.object'),
      modelId: o.modelId,
      placement,
      params,
      visible: o.visible !== false,
      origin: o.origin === 'demo' ? 'demo' : 'studio',
      ...(i18n ? { i18n } : {}),
    });
  }
  const buildingIds = new Set(buildings.map((b) => b.id));
  for (const item of Array.isArray(r.businesses) ? r.businesses : []) {
    const b = rec(item);
    if (!b || !isStr(b.id) || !isStr(b.name)) continue;
    const i18n = sanitizeLocalized(b.i18n);
    businesses.push({
      id: b.id,
      name: b.name,
      category: isStr(b.category) ? (b.category as Business['category']) : 'other',
      description: isStr(b.description) ? b.description : '',
      hours: isStr(b.hours) ? b.hours : '',
      phone: isStr(b.phone) ? b.phone : '',
      whatsapp: isStr(b.whatsapp) ? b.whatsapp : '',
      instagram: isStr(b.instagram) ? b.instagram : '',
      color: isStr(b.color) ? b.color : '#e8b34b',
      // referência quebrada (edifício removido) → comércio fica sem edifício
      buildingId: isStr(b.buildingId) && buildingIds.has(b.buildingId) ? b.buildingId : null,
      published: b.published !== false,
      origin: b.origin === 'demo' ? 'demo' : 'studio',
      ...(i18n ? { i18n } : {}),
    });
  }
  return {
    schemaVersion: 1,
    updatedAt: isStr(r.updatedAt) ? r.updatedAt : new Date().toISOString(),
    buildings,
    objects,
    businesses,
    places: sanitizePlaces(r.places),
  };
}
