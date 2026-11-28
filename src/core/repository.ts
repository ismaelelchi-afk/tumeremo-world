/**
 * Persistencia. `WorldRepository` es el contrato que un backend futuro deberá implementar
 * (autenticación, versionado, publicación). Hoy existe apenas la implementação local.
 *
 * Principio de esta fase: **ningún dato se descarta para superar una validación**. Todo lo que
 * sea reparable se repara y se informa; lo que no pueda analizarse se pone en cuarentena sin
 * sobrescribirlo jamás con la semilla.
 */
import placesJson from '../data/places.json';
import seedJson from '../data/seed.json';
import { sanitizeAnimation, sanitizeAnimationOverrides } from './animation';
import { FEATURE_BUILDINGS, FEATURE_BUSINESSES } from '../data/featureBusinesses';
import { getModel } from '../data/models';
import { newId } from './ids';
import { sanitizeLocalized } from '../i18n/localized';
import { I18nError, translate, type TranslationKey } from '../i18n/translate';
import type { Localized, LocalizedTexts } from '../i18n/types';
import { PLACE_CATEGORIES, PLACE_ICON_BY_CATEGORY, PLACE_ICONS } from './labels';
import { safeRead, safeRemove, safeRemovePrefix, safeWrite, safeKeys } from './safeStorage';
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

export const STORAGE_KEY = 'tumeremo-world:document:v1';
export const QUARANTINE_PREFIX = `${STORAGE_KEY}:quarantine:`;
export const BACKUP_PREFIX = `${STORAGE_KEY}:backup:`;

export type LoadStatus = 'empty' | 'ok' | 'corrupt' | 'invalid' | 'unavailable';
export type ValidationArea = 'building' | 'object' | 'business' | 'place';

export interface ValidationIssue {
  area: ValidationArea;
  id: string;
  reason: TranslationKey;
}

export interface ValidationReport {
  incoming: number;
  kept: number;
  repaired: number;
  issues: ValidationIssue[];
}

export interface LoadResult {
  status: LoadStatus;
  doc: WorldDocument | null;
  report?: ValidationReport;
  /** JSON original, conservado para recuperación manual. */
  raw?: string;
  quarantineKey?: string;
}

export interface WorldRepository {
  /** Nunca devuelve un documento nuevo en silencio: informa del estado del original. */
  load(): Promise<LoadResult>;
  save(doc: WorldDocument): Promise<void>;
  clear(): Promise<void>;
  clearBackups(): Promise<void>;
  clearQuarantine(): Promise<void>;
}

const MAX_COPIES = 3;

export class LocalStorageRepository implements WorldRepository {
  constructor(private key: string = STORAGE_KEY) {}

  private keepRecent(prefix: string) {
    const keys = safeKeys(prefix).sort();
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_COPIES))) safeRemove(old);
  }

  /** Guarda una copia íntegra del original sin alterarlo, con fecha para poder recuperarla. */
  private preserve(prefix: string, raw: string): string | null {
    const key = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!safeWrite(key, JSON.stringify({ key: this.key, at: new Date().toISOString(), raw }))) return null;
    this.keepRecent(prefix);
    return key;
  }

  async load(): Promise<LoadResult> {
    const { value: raw, failed } = safeRead(this.key);
    if (failed) return { status: 'unavailable', doc: null };
    if (!raw) return { status: 'empty', doc: null };

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { status: 'corrupt', doc: null, raw, quarantineKey: this.preserve(QUARANTINE_PREFIX, raw) ?? undefined };
    }
    const obj = rec(parsed);
    if (!obj) {
      return { status: 'invalid', doc: null, raw, quarantineKey: this.preserve(QUARANTINE_PREFIX, raw) ?? undefined };
    }

    // Copia de seguridad ANTES de cualquier migración destructiva heredada.
    if (rec(obj.worldCleanupMigration)?.applied !== true) this.preserve(BACKUP_PREFIX, raw);

    const result = validateDocumentDetailed(parsed);
    if (!result.doc) {
      return { status: 'invalid', doc: null, raw, quarantineKey: this.preserve(QUARANTINE_PREFIX, raw) ?? undefined };
    }
    return { status: 'ok', doc: result.doc, report: result.report };
  }

  async save(doc: WorldDocument): Promise<void> {
    if (!safeWrite(this.key, JSON.stringify(doc))) throw new I18nError('storage.saveFailed');
  }

  async clear(): Promise<void> {
    safeRemove(this.key);
  }

  async clearBackups(): Promise<void> {
    safeRemovePrefix(BACKUP_PREFIX);
  }

  async clearQuarantine(): Promise<void> {
    safeRemovePrefix(QUARANTINE_PREFIX);
  }
}

export const repository: WorldRepository = new LocalStorageRepository();

/** Garantiza que todo documento cargado, sembrado o importado tenga animaciones válidas. */
function withAnimation(doc: WorldDocument): WorldDocument {
  return { ...doc, animation: sanitizeAnimation(doc.animation) };
}

/* ------------------------------------------------------------------ migración */

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const pick = <T>(value: T | undefined | null, fallback: T): T =>
  value === undefined || value === null ? fallback : value;

/** Fusiona `i18n`: gana el texto existente; se copian solo idiomas/claves ausentes. */
function mergeLocalized(
  existing: Localized<LocalizedTexts> | undefined,
  canonical: Localized<LocalizedTexts> | undefined,
): Localized<LocalizedTexts> | undefined {
  if (!canonical) return existing;
  const merged: Localized<LocalizedTexts> = { ...(existing ?? {}) };
  for (const [lang, texts] of Object.entries(canonical) as Array<[keyof Localized<LocalizedTexts>, LocalizedTexts]>) {
    if (!texts) continue;
    merged[lang] = { ...texts, ...(merged[lang] ?? {}) };
  }
  return merged;
}

/** Rellena solo campos ausentes; cualquier valor editado (incluido `''` o `false`) se conserva. */
function fillBuilding(existing: CustomBuilding, canonical: CustomBuilding): CustomBuilding {
  return {
    ...existing,
    name: pick(existing.name, canonical.name),
    modelId: pick(existing.modelId, canonical.modelId),
    description: pick(existing.description, canonical.description),
    ...(existing.category !== undefined || canonical.category !== undefined
      ? { category: existing.category ?? canonical.category }
      : {}),
    placeId: pick(existing.placeId, canonical.placeId),
    visible: pick(existing.visible, canonical.visible),
    origin: pick(existing.origin, canonical.origin),
    placement: {
      position: {
        lng: pick(existing.placement?.position?.lng, canonical.placement.position.lng),
        lat: pick(existing.placement?.position?.lat, canonical.placement.position.lat),
      },
      heading: pick(existing.placement?.heading, canonical.placement.heading),
      scale: pick(existing.placement?.scale, canonical.placement.scale),
    },
    params: {
      width: pick(existing.params?.width, canonical.params.width),
      depth: pick(existing.params?.depth, canonical.params.depth),
      height: pick(existing.params?.height, canonical.params.height),
      wallColor: pick(existing.params?.wallColor, canonical.params.wallColor),
      roofColor: pick(existing.params?.roofColor, canonical.params.roofColor),
      accentColor: pick(existing.params?.accentColor, canonical.params.accentColor),
    },
    i18n: mergeLocalized(existing.i18n, canonical.i18n),
  };
}

/** Rellena solo campos ausentes del comercio; `buildingId` se repara por separado. */
function fillBusiness(existing: Business, canonical: Business): Business {
  return {
    ...existing,
    name: pick(existing.name, canonical.name),
    category: pick(existing.category, canonical.category),
    description: pick(existing.description, canonical.description),
    hours: pick(existing.hours, canonical.hours),
    phone: pick(existing.phone, canonical.phone),
    whatsapp: pick(existing.whatsapp, canonical.whatsapp),
    instagram: pick(existing.instagram, canonical.instagram),
    color: pick(existing.color, canonical.color),
    published: pick(existing.published, canonical.published),
    origin: pick(existing.origin, canonical.origin),
    i18n: mergeLocalized(existing.i18n, canonical.i18n),
  };
}

/**
 * Migración única de los tres comercios compartidos.
 * Añade lo que falte, conserva íntegramente lo que ya exista (incluidas ediciones),
 * repara enlaces rotos con el edificio canónico y marca el resultado como aplicado.
 * Con el marcador presente no vuelve a tocar nada: las bajas hechas en STUDIO persisten.
 */
export function ensureFeatureEntities(doc: WorldDocument): WorldDocument {
  if (doc.featureMigration?.applied === true) return doc;

  const canonicalBuildings = new Map(FEATURE_BUILDINGS.map((b) => [b.id, b]));
  const canonicalBusinesses = new Map(FEATURE_BUSINESSES.map((b) => [b.id, b]));

  const buildings = doc.buildings.map((b) => {
    const canonical = canonicalBuildings.get(b.id);
    return canonical ? fillBuilding(b, canonical) : b;
  });
  const buildingIds = new Set(buildings.map((b) => b.id));
  for (const canonical of FEATURE_BUILDINGS) {
    if (!buildingIds.has(canonical.id)) buildings.push(clone(canonical));
  }

  const businesses = doc.businesses.map((b) => {
    const canonical = canonicalBusinesses.get(b.id);
    return canonical ? fillBusiness(b, canonical) : b;
  });
  const businessIds = new Set(businesses.map((b) => b.id));
  for (const canonical of FEATURE_BUSINESSES) {
    if (!businessIds.has(canonical.id)) businesses.push(clone(canonical));
  }

  const buildingById = new Map(buildings.map((b) => [b.id, b]));
  for (let i = 0; i < businesses.length; i++) {
    const business = businesses[i];
    const canonical = canonicalBusinesses.get(business.id);
    if (!canonical) continue;
    if (business.buildingId != null && buildingById.has(business.buildingId)) continue;
    if (!canonical.buildingId || !buildingById.has(canonical.buildingId)) continue;
    businesses[i] = { ...business, buildingId: canonical.buildingId };
  }

  return { ...doc, buildings, businesses, featureMigration: { applied: true } };
}

/**
 * Separación definitiva puntos ↔ estructuras. Quita los vínculos `placeId` para que ninguna
 * estructura dependa de un punto, sin eliminar ninguna entidad. Es idempotente.
 */
export function separatePlacesFromStructures(doc: WorldDocument): WorldDocument {
  const hasLinks = doc.buildings.some((b) => b.placeId != null);
  if (doc.placesStructuresMigration?.applied === true && !hasLinks) return doc;
  return {
    ...doc,
    buildings: hasLinks ? doc.buildings.map((b) => (b.placeId ? { ...b, placeId: null } : b)) : doc.buildings,
    placesStructuresMigration: { applied: true },
  };
}

/**
 * Migración única del mundo: garantiza los tres edificios y comercios oficiales **sin borrar
 * nada más**. Los documentos heredados conservan sus puntos, objetos y estructuras aunque no
 * estuvieran en la semilla. Se conservan también `removedPlaceIds` y la animación.
 */
export function cleanupWorld(doc: WorldDocument): WorldDocument {
  if (doc.worldCleanupMigration?.applied === true) return doc;

  const buildings = [...doc.buildings];
  const buildingIds = new Set(buildings.map((b) => b.id));
  for (const canonical of FEATURE_BUILDINGS) {
    if (!buildingIds.has(canonical.id)) buildings.push(clone(canonical));
  }

  const businesses = [...doc.businesses];
  const businessIds = new Set(businesses.map((b) => b.id));
  for (const canonical of FEATURE_BUSINESSES) {
    if (!businessIds.has(canonical.id)) businesses.push(clone(canonical));
  }

  return { ...doc, buildings, businesses, worldCleanupMigration: { applied: true } };
}

export function seedDocument(): WorldDocument {
  const doc = JSON.parse(JSON.stringify(seedJson)) as WorldDocument;
  return withAnimation(
    cleanupWorld(
      separatePlacesFromStructures(
        ensureFeatureEntities({ ...doc, places: SEED_PLACES.map((p) => ({ ...p, position: { ...p.position } })) }),
      ),
    ),
  );
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isHexColor = (v: unknown): v is string => isStr(v) && /^#[0-9a-fA-F]{6}$/.test(v);
const rec = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** Semilla de puntos (vacía). El normalizador se conserva para documentos heredados. */
export const SEED_PLACES: Place[] = (placesJson as unknown as Array<Omit<Place, 'visible' | 'icon'>>).map((p) => ({
  ...p,
  visible: true,
  icon: PLACE_ICON_BY_CATEGORY[p.category] ?? 'pin',
}));

const CATEGORIES = new Set<string>(PLACE_CATEGORIES);
const ICONS = new Set<string>(PLACE_ICONS);
const SEED_BY_ID = new Map(SEED_PLACES.map((p) => [p.id, p]));
const FALLBACK_POSITION = FEATURE_BUILDINGS[0]?.placement.position ?? { lng: -65.63, lat: 7.08 };
const GENERIC_PARAMS: ModelParams = {
  width: 4,
  depth: 4,
  height: 3,
  wallColor: '#cdd5d9',
  roofColor: '#4b5963',
  accentColor: '#5eead4',
};

/** Valores numéricos acotados: un JSON importado no puede crear geometría gigante ni negativa. */
function clampNumber(value: number, range?: [number, number], hard: [number, number] = [0.05, 10000]): number {
  const [lo, hi] = range ?? hard;
  return Math.min(hi, Math.max(lo, value));
}

/** Normaliza parámetros sin rechazar la entidad: repara colores y acota dimensiones al modelo. */
function sanitizeParams(raw: unknown, modelId: string): { params: ModelParams; repaired: boolean } {
  const model = getModel(modelId);
  const d = model?.defaults ?? GENERIC_PARAMS;
  const limits = model?.limits;
  const r = rec(raw) ?? {};
  let repaired = false;
  const num = (key: keyof ModelParams, range?: [number, number]): number => {
    const value = r[key];
    if (!isNum(value)) {
      repaired = true;
      return d[key] as number;
    }
    const next = clampNumber(value, range);
    if (next !== value) repaired = true;
    return next;
  };
  const color = (key: 'wallColor' | 'roofColor' | 'accentColor'): string => {
    const value = r[key];
    if (isHexColor(value)) return value;
    if (value !== undefined) repaired = true;
    return d[key];
  };
  return {
    params: {
      width: num('width', limits?.width),
      depth: num('depth', limits?.depth),
      height: num('height', limits?.height),
      wallColor: color('wallColor'),
      roofColor: color('roofColor'),
      accentColor: color('accentColor'),
    },
    repaired,
  };
}

function sanitizePlacement(raw: unknown) {
  const r = rec(raw);
  const pos = rec(r?.position);
  if (!r || !pos) return null;
  const validLng = isNum(pos.lng) && pos.lng >= -180 && pos.lng <= 180;
  const validLat = isNum(pos.lat) && pos.lat >= -90 && pos.lat <= 90;
  const repaired = !validLng || !validLat;
  const heading = isNum(r.heading) ? clampNumber(r.heading, undefined, [-360, 360]) : 0;
  const scale = isNum(r.scale) && r.scale > 0 ? clampNumber(r.scale, undefined, [0.05, 20]) : 1;
  return {
    placement: {
      position: {
        lng: validLng ? (pos.lng as number) : FALLBACK_POSITION.lng,
        lat: validLat ? (pos.lat as number) : FALLBACK_POSITION.lat,
      },
      heading,
      scale,
    },
    repaired: repaired || heading !== r.heading || scale !== r.scale,
  };
}

/** Preserva a fonte original (OSM/manual) e usa a seed apenas como referência. */
function sanitizePlace(raw: unknown, note: (id: string, reason: TranslationKey) => void): Place | null {
  const p = rec(raw);
  if (!p) return null;
  const rawId = isStr(p.id) ? p.id : undefined;
  const id = rawId && rawId.trim() ? rawId : newId('plc');
  if (id !== rawId) note(id, 'validate.reason.missingId');
  const base = SEED_BY_ID.get(rawId ?? '');
  const pos = rec(p.position);
  const position =
    pos && isNum(pos.lng) && isNum(pos.lat) ? { lng: pos.lng, lat: pos.lat } : base?.position ?? { ...FALLBACK_POSITION };
  if (pos && (!isNum(pos.lng) || !isNum(pos.lat))) note(id, 'validate.reason.invalidPlacement');
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
  const size = isNum(p.size) ? Math.min(2.5, Math.max(0.5, p.size)) : base?.size;
  const opacity = isNum(p.opacity) ? Math.min(1, Math.max(0.1, p.opacity)) : base?.opacity;
  const color = isHexColor(p.color) ? p.color : base?.color;
  const strokeColor = isHexColor(p.strokeColor) ? p.strokeColor : base?.strokeColor;
  const label = isStr(p.label) && p.label.trim() ? p.label : base?.label;
  const showLabel = typeof p.showLabel === 'boolean' ? p.showLabel : base?.showLabel;
  const animation = sanitizeAnimationOverrides(p.animation);

  return {
    id,
    name,
    category,
    position,
    ...(description !== undefined ? { description } : {}),
    ...(i18n ? { i18n } : {}),
    source,
    visible: typeof p.visible === 'boolean' ? p.visible : base?.visible ?? true,
    icon,
    ...(size !== undefined ? { size } : {}),
    ...(color !== undefined ? { color } : {}),
    ...(strokeColor !== undefined ? { strokeColor } : {}),
    ...(opacity !== undefined ? { opacity } : {}),
    ...(label !== undefined ? { label } : {}),
    ...(showLabel !== undefined ? { showLabel } : {}),
    ...(animation ? { animation } : {}),
  };
}

/**
 * Normaliza los puntos del documento heredado. La semilla actual no aporta puntos,
 * así que un borrador vacío se mantiene vacío; las bajas registradas en
 * `removedPlaceIds` se siguen respetando.
 */
function sanitizePlaces(raw: unknown, removedIds: ReadonlySet<string>, note: (id: string, reason: TranslationKey) => void): Place[] {
  const merged = new Map<string, Place>();
  for (const item of Array.isArray(raw) ? raw : []) {
    const place = sanitizePlace(item, note);
    if (place && !removedIds.has(place.id) && !merged.has(place.id)) merged.set(place.id, place);
  }
  for (const seed of SEED_PLACES) {
    if (!removedIds.has(seed.id) && !merged.has(seed.id)) {
      merged.set(seed.id, { ...seed, position: { ...seed.position } });
    }
  }
  const seedIds = new Set(SEED_PLACES.map((p) => p.id));
  return [
    ...SEED_PLACES.filter((seed) => merged.has(seed.id)).map((seed) => merged.get(seed.id)!),
    ...[...merged.values()].filter((p) => !seedIds.has(p.id)),
  ];
}

/**
 * Valida y normaliza un documento desconocido (rascunho local ou arquivo importado),
 * devolviendo además un informe de lo que se reparó. **Nunca descarta una entidad por
 * campos inválidos**: los repara con valores seguros y deja constancia del motivo.
 */
export function validateDocumentDetailed(raw: unknown): { doc: WorldDocument | null; report: ValidationReport } {
  const r = rec(raw);
  const report: ValidationReport = { incoming: 0, kept: 0, repaired: 0, issues: [] };
  if (!r) return { doc: null, report };
  const note = (area: ValidationArea, id: string, reason: TranslationKey) => {
    report.repaired++;
    report.issues.push({ area, id, reason });
  };

  const buildings: CustomBuilding[] = [];
  const objects: WorldObject3D[] = [];
  const businesses: Business[] = [];
  const rawBuildings = Array.isArray(r.buildings) ? r.buildings : [];
  const rawObjects = Array.isArray(r.objects) ? r.objects : [];
  const rawBusinesses = Array.isArray(r.businesses) ? r.businesses : [];
  const rawPlaces = Array.isArray(r.places) ? r.places : [];
  report.incoming = rawBuildings.length + rawObjects.length + rawBusinesses.length + rawPlaces.length;

  for (const item of rawBuildings) {
    const b = rec(item);
    if (!b) continue;
    const id = isStr(b.id) && b.id.trim() ? b.id : newId('bld');
    if (id !== b.id) note('building', id, 'validate.reason.missingId');
    const modelId = isStr(b.modelId) && b.modelId.trim() ? b.modelId : FEATURE_BUILDINGS[0]?.id ?? 'bld_default';
    if (modelId !== b.modelId) note('building', id, 'validate.reason.missingModel');
    const placementResult = sanitizePlacement(b.placement);
    if (!placementResult || placementResult.repaired) {
      note('building', id, 'validate.reason.invalidPlacement');
    }
    const paramsResult = sanitizeParams(b.params, modelId);
    if (paramsResult.repaired) note('building', id, 'validate.reason.invalidParams');
    const i18n = sanitizeLocalized(b.i18n);
    const animation = sanitizeAnimationOverrides(b.animation);
    const category = isStr(b.category) && PLACE_CATEGORIES.includes(b.category as PlaceCategory)
      ? (b.category as PlaceCategory)
      : undefined;
    buildings.push({
      id,
      kind: 'building',
      name: isStr(b.name) && b.name.trim() ? b.name : translate('default.building'),
      modelId,
      placement: placementResult?.placement ?? {
        position: { ...FALLBACK_POSITION },
        heading: 0,
        scale: 1,
      },
      params: paramsResult.params,
      description: isStr(b.description) ? b.description : '',
      ...(category ? { category } : {}),
      placeId: isStr(b.placeId) ? b.placeId : null,
      visible: b.visible !== false,
      origin: b.origin === 'demo' ? 'demo' : 'studio',
      ...(i18n ? { i18n } : {}),
      ...(animation ? { animation } : {}),
    });
  }
  for (const item of rawObjects) {
    const o = rec(item);
    if (!o) continue;
    const id = isStr(o.id) && o.id.trim() ? o.id : newId('obj');
    if (id !== o.id) note('object', id, 'validate.reason.missingId');
    const modelId = isStr(o.modelId) && o.modelId.trim() ? o.modelId : FEATURE_BUILDINGS[0]?.id ?? 'bld_default';
    if (modelId !== o.modelId) note('object', id, 'validate.reason.missingModel');
    const placementResult = sanitizePlacement(o.placement);
    if (!placementResult || placementResult.repaired) note('object', id, 'validate.reason.invalidPlacement');
    const paramsResult = sanitizeParams(o.params, modelId);
    if (paramsResult.repaired) note('object', id, 'validate.reason.invalidParams');
    const i18n = sanitizeLocalized(o.i18n);
    const animation = sanitizeAnimationOverrides(o.animation);
    objects.push({
      id,
      kind: 'object',
      name: isStr(o.name) && o.name.trim() ? o.name : translate('default.object'),
      modelId,
      placement: placementResult?.placement ?? { position: { ...FALLBACK_POSITION }, heading: 0, scale: 1 },
      params: paramsResult.params,
      visible: o.visible !== false,
      origin: o.origin === 'demo' ? 'demo' : 'studio',
      ...(i18n ? { i18n } : {}),
      ...(animation ? { animation } : {}),
    });
  }
  const buildingIds = new Set(buildings.map((b) => b.id));
  for (const item of rawBusinesses) {
    const b = rec(item);
    if (!b) continue;
    const id = isStr(b.id) && b.id.trim() ? b.id : newId('biz');
    if (id !== b.id) note('business', id, 'validate.reason.missingId');
    const name = isStr(b.name) && b.name.trim() ? b.name : translate('business.newName');
    if (name !== b.name) note('business', id, 'validate.reason.invalidName');
    const color = isHexColor(b.color) ? b.color : '#e8b34b';
    if (color !== b.color) note('business', id, 'validate.reason.invalidColor');
    const buildingId = isStr(b.buildingId) && buildingIds.has(b.buildingId) ? b.buildingId : null;
    if (buildingId !== b.buildingId) note('business', id, 'validate.reason.brokenBuilding');
    const i18n = sanitizeLocalized(b.i18n);
    businesses.push({
      id,
      name,
      category: isStr(b.category) ? (b.category as Business['category']) : 'other',
      description: isStr(b.description) ? b.description : '',
      hours: isStr(b.hours) ? b.hours : '',
      phone: isStr(b.phone) ? b.phone : '',
      whatsapp: isStr(b.whatsapp) ? b.whatsapp : '',
      instagram: isStr(b.instagram) ? b.instagram : '',
      color,
      buildingId,
      published: b.published !== false,
      origin: b.origin === 'demo' ? 'demo' : 'studio',
      ...(i18n ? { i18n } : {}),
    });
  }

  const migrationApplied = rec(r.featureMigration)?.applied === true;
  const separationApplied = rec(r.placesStructuresMigration)?.applied === true;
  const cleanupApplied = rec(r.worldCleanupMigration)?.applied === true;
  const removedPlaceIds = Array.isArray(r.removedPlaceIds)
    ? [...new Set(r.removedPlaceIds.filter(isStr))]
    : [];
  const places = sanitizePlaces(rawPlaces, new Set(removedPlaceIds), (id, reason) => note('place', id, reason));

  const doc = withAnimation(
    cleanupWorld(
      separatePlacesFromStructures(
        ensureFeatureEntities({
          schemaVersion: 1,
          updatedAt: isStr(r.updatedAt) ? r.updatedAt : new Date().toISOString(),
          animation: sanitizeAnimation(r.animation),
          buildings,
          objects,
          businesses,
          places,
          ...(removedPlaceIds.length ? { removedPlaceIds } : {}),
          ...(migrationApplied ? { featureMigration: { applied: true as const } } : {}),
          ...(separationApplied ? { placesStructuresMigration: { applied: true as const } } : {}),
          ...(cleanupApplied ? { worldCleanupMigration: { applied: true as const } } : {}),
        }),
      ),
    ),
  );
  report.kept = doc.buildings.length + doc.objects.length + doc.businesses.length + (doc.places?.length ?? 0);
  return { doc, report };
}

/** Compatibilidad: validación sin informe (la usan los importadores y la semilla). */
export function validateDocument(raw: unknown): WorldDocument | null {
  return validateDocumentDetailed(raw).doc;
}
