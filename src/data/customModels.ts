import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { newId } from '../core/ids';
import { validateDocument } from '../core/repository';
import type { ModelCategory, ModelDef, ModelParams, WorldDocument } from '../core/types';
import { addModelAliases, getModel, getModelLibrary, MODEL_LIBRARY, registerModel } from './models';
import { I18nError, translate, type TranslationKey } from '../i18n/translate';

/**
 * Modelos GLB locais: arquivo + metadatos no IndexedDB (localStorage não serve para binários
 * grandes) e um registro em memória que alimenta a biblioteca, o motor 3D, o STUDIO e o JSON.
 */
export interface StoredModel {
  id: string;
  name: string;
  category: ModelCategory;
  fileName: string;
  size: number;
  hash: string;
  createdAt: string;
  buffer: ArrayBuffer;
  thumbnail?: string;
  defaults: ModelParams;
  limits: ModelDef['limits'];
  description: string;
  hasSign?: boolean;
  aliases?: string[];
}

/** Formato incluído no JSON exportado pelo STUDIO (opcional e retrocompatível). */
export interface CustomModelBundle {
  id: string;
  aliases?: string[];
  name: string;
  category: ModelCategory;
  fileName: string;
  size: number;
  hash: string;
  createdAt: string;
  thumbnail?: string;
  glb: string;
  defaults: ModelParams;
  limits: ModelDef['limits'];
  description: string;
  hasSign?: boolean;
}

export interface ImportResult {
  doc: WorldDocument | null;
  imported: number;
  reused: number;
  skipped: number;
}

const DB_NAME = 'tumeremo-world';
const STORE = 'glb-models';
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const GLB_MAGIC = 0x46546c67; // "glTF"

const BUILTIN_IDS = new Set(MODEL_LIBRARY.map((m) => m.id));
const records = new Map<string, StoredModel>();
const thumbnails = new Map<string, string>();
const urls = new Map<string, string>();
let dbPromise: Promise<IDBDatabase> | null = null;
let initPromise: Promise<void> | null = null;

/** Erro de carregamento inicial, exibido como aviso na biblioteca. */
export let customModelError: TranslationKey | null = null;

/* ------------------------------------------------------------------ IDB */

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new I18nError('model.error.indexedDbUnavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new I18nError('model.error.openFailed'));
  }).catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

async function getAllStored(): Promise<StoredModel[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result ?? []) as StoredModel[]);
    req.onerror = () => reject(req.error ?? new I18nError('model.error.readFailed'));
  });
}

async function putStored(rec: StoredModel): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new I18nError('model.error.saveFailed'));
    tx.onabort = () => reject(tx.error ?? new I18nError('model.error.saveFailed'));
  });
}

/* --------------------------------------------------------------- registro */

function registerRecord(rec: StoredModel) {
  const previous = urls.get(rec.id);
  if (previous) URL.revokeObjectURL(previous);
  const url = URL.createObjectURL(new Blob([rec.buffer], { type: 'model/gltf-binary' }));
  urls.set(rec.id, url);
  records.set(rec.id, rec);
  if (rec.thumbnail) thumbnails.set(rec.id, rec.thumbnail);
  else thumbnails.delete(rec.id);

  const def: ModelDef = {
    id: rec.id,
    name: rec.name,
    category: rec.category,
    description: rec.description,
    source: { type: 'glb', url },
    defaults: rec.defaults,
    limits: rec.limits,
    hasSign: rec.hasSign,
  };
  registerModel(def, rec.aliases ?? []);
}

/** Chamada antes de documentStore.init(): os modelos precisam existir para validar o JSON salvo. */
export function initCustomModels(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        for (const rec of await getAllStored()) registerRecord(rec);
        customModelError = null;
      } catch (e) {
        customModelError = 'model.error.loadFailed';
        console.warn('[customModels]', e);
      }
    })();
  }
  return initPromise;
}

export function getCustomModelThumbnail(id: string): string | undefined {
  return thumbnails.get(id);
}

/* ------------------------------------------------------------- GLB / hash */

function validateGlbHeader(buffer: ArrayBuffer, fileName: string) {
  if (buffer.byteLength < 20) throw new I18nError('model.error.emptyFileNamed', { file: fileName });
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new I18nError('model.error.invalidFileNamed', { file: fileName });
  if (view.getUint32(4, true) !== 2) throw new I18nError('model.error.unsupportedVersionNamed', { file: fileName });
  if (view.getUint32(8, true) !== buffer.byteLength) throw new I18nError('model.error.incompleteNamed', { file: fileName });
}

async function parseGlb(buffer: ArrayBuffer, fileName: string) {
  let scene: THREE.Group;
  try {
    scene = (await new GLTFLoader().parseAsync(buffer, '')).scene;
  } catch {
    throw new I18nError('model.error.unreadableNamed', { file: fileName });
  }
  const box = new THREE.Box3().setFromObject(scene);
  if (box.isEmpty()) throw new I18nError('model.error.noGeometryNamed', { file: fileName });
  const size = box.getSize(new THREE.Vector3());
  if (![size.x, size.y, size.z].every((v) => Number.isFinite(v) && v > 0)) {
    throw new I18nError('model.error.invalidDimensionsNamed', { file: fileName });
  }
  return { scene, box, size };
}

export async function hashBuffer(buffer: ArrayBuffer): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback para contexto HTTP (sem crypto.subtle): hash determinístico de 64 bits.
  const bytes = new Uint8Array(buffer);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 16777619) >>> 0;
    h2 = Math.imul(h2 + bytes[i], 16777619) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function round(v: number) {
  return Math.round(v * 100) / 100;
}

function defaultsFromSize(size: THREE.Vector3) {
  const width = Math.max(0.1, round(size.x));
  const depth = Math.max(0.1, round(size.z));
  const height = Math.max(0.2, round(size.y));
  const limits: ModelDef['limits'] = {
    width: [Math.max(0.1, round(width * 0.2)), Math.max(1, round(width * 5))],
    depth: [Math.max(0.1, round(depth * 0.2)), Math.max(1, round(depth * 5))],
    height: [Math.max(0.2, round(height * 0.2)), Math.max(0.5, round(height * 5))],
  };
  const category: ModelCategory = height >= 2.2 && width * depth >= 3 ? 'building' : 'object';
  return {
    category,
    defaults: { width, depth, height, wallColor: '#cdd5d9', roofColor: '#4b5963', accentColor: '#5eead4' } satisfies ModelParams,
    limits,
  };
}

function sanitizeParams(raw: unknown, fallback: ModelParams): ModelParams {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d);
  const color = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
  return {
    width: num(r.width, fallback.width),
    depth: num(r.depth, fallback.depth),
    height: num(r.height, fallback.height),
    wallColor: color(r.wallColor, fallback.wallColor),
    roofColor: color(r.roofColor, fallback.roofColor),
    accentColor: color(r.accentColor, fallback.accentColor),
  };
}

function sanitizeLimits(raw: unknown, fallback: ModelDef['limits']): ModelDef['limits'] {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const pair = (key: keyof ModelDef['limits']): [number, number] => {
    const v = r[key];
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number' && v[1] > v[0]) {
      return [v[0], v[1]];
    }
    return fallback[key];
  };
  return { width: pair('width'), depth: pair('depth'), height: pair('height') };
}

function uniqueName(base: string): string {
  const used = new Set(getModelLibrary().map((m) => m.name));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

function makeThumbnail(scene: THREE.Object3D, box: THREE.Box3): string | undefined {
  try {
    const model = scene.clone(true);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    const size = box.getSize(new THREE.Vector3());
    const max = Math.max(size.x, size.y, size.z, 0.001);

    const holder = new THREE.Scene();
    holder.add(model);
    holder.add(new THREE.AmbientLight(0xffffff, 2.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(max, max * 1.5, max * 2);
    holder.add(sun);

    const camera = new THREE.PerspectiveCamera(32, 1, max / 100, max * 40);
    camera.position.set(max * 1.7, max * 1.35, max * 1.9);
    camera.lookAt(0, 0, 0);

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 160;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(160, 160, false);
    renderer.setClearColor(0x000000, 0);
    renderer.render(holder, camera);
    const data = canvas.toDataURL('image/png');
    renderer.dispose();
    return data.length > 32 ? data : undefined;
  } catch {
    return undefined; // sem WebGL, a biblioteca mostra o ícone padrão
  }
}

/* --------------------------------------------------------- importação local */

export async function addGlbFile(file: File): Promise<ModelDef> {
  await initCustomModels();
  if (!/\.glb$/i.test(file.name)) throw new I18nError('model.error.invalidFile');
  if (file.size === 0) throw new I18nError('model.error.emptyFile');
  if (file.size > MAX_FILE_BYTES) throw new I18nError('model.error.tooLarge');

  const buffer = await file.arrayBuffer();
  validateGlbHeader(buffer, file.name);
  const parsed = await parseGlb(buffer, file.name);
  const hash = await hashBuffer(buffer);

  const stored = await getAllStored();
  const duplicate = stored.find((r) => r.hash === hash);
  if (duplicate) throw new I18nError('model.error.duplicate', { name: duplicate.name });

  const detected = defaultsFromSize(parsed.size);
  const baseName = file.name.replace(/\.glb$/i, '').replace(/[_-]+/g, ' ').trim() || translate('default.model');
  const rec: StoredModel = {
    id: newId('mdl'),
    name: uniqueName(baseName),
    category: detected.category,
    fileName: file.name,
    size: buffer.byteLength,
    hash,
    createdAt: new Date().toISOString(),
    buffer,
    thumbnail: makeThumbnail(parsed.scene, parsed.box),
    defaults: detected.defaults,
    limits: detected.limits,
    description: translate('default.importedModel', { file: file.name }),
  };
  await putStored(rec);
  registerRecord(rec);
  customModelError = null;
  return getModel(rec.id)!;
}

/* ------------------------------------------------------------ JSON do STUDIO */

export async function exportDocumentJson(doc: WorldDocument): Promise<string> {
  const stored = await getAllStored();
  const bundles: CustomModelBundle[] = stored.map((rec) => ({
    id: rec.id,
    aliases: rec.aliases,
    name: rec.name,
    category: rec.category,
    fileName: rec.fileName,
    size: rec.size,
    hash: rec.hash,
    createdAt: rec.createdAt,
    thumbnail: rec.thumbnail,
    glb: bufferToBase64(rec.buffer),
    defaults: rec.defaults,
    limits: rec.limits,
    description: rec.description,
    hasSign: rec.hasSign,
  }));
  const out: Record<string, unknown> = { ...doc };
  if (bundles.length) out.customModels = bundles;
  return JSON.stringify(out, null, 2);
}

function safeModelId(value: unknown): string {
  if (typeof value === 'string' && /^[a-z0-9_]{3,80}$/i.test(value) && !BUILTIN_IDS.has(value)) return value;
  return newId('mdl');
}

interface BundleResult {
  status: 'imported' | 'reused';
  remap?: [string, string];
}

async function importBundle(raw: CustomModelBundle): Promise<BundleResult> {
  await initCustomModels();
  if (!raw || typeof raw.glb !== 'string') throw new I18nError('model.error.bundleInvalid');
  const fileName = typeof raw.fileName === 'string' ? raw.fileName : translate('model.defaultFileName');
  const buffer = base64ToBuffer(raw.glb);
  validateGlbHeader(buffer, fileName);
  const parsed = await parseGlb(buffer, fileName);
  const hash = typeof raw.hash === 'string' && /^[0-9a-f]{8,64}$/i.test(raw.hash)
    ? raw.hash.toLowerCase()
    : await hashBuffer(buffer);

  const aliases = Array.isArray(raw.aliases) ? raw.aliases.filter((a): a is string => typeof a === 'string' && /^[a-z0-9_]{3,80}$/i.test(a)) : [];
  const stored = await getAllStored();
  const duplicate = stored.find((r) => r.hash === hash);
  if (duplicate) {
    const merged = Array.from(new Set([...(duplicate.aliases ?? []), ...aliases])).filter(
      (a) => a !== duplicate.id && !BUILTIN_IDS.has(a),
    );
    const updated = { ...duplicate, aliases: merged };
    await putStored(updated);
    records.set(updated.id, updated);
    addModelAliases(merged, updated.id);
    return { status: 'reused' };
  }

  const detected = defaultsFromSize(parsed.size);
  const requestedId = safeModelId(raw.id);
  const conflict = stored.some((r) => r.id === requestedId);
  const id = conflict ? newId('mdl') : requestedId;
  const rec: StoredModel = {
    id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : uniqueName(translate('default.model')),
    category: raw.category === 'object' ? 'object' : 'building',
    fileName,
    size: buffer.byteLength,
    hash,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    buffer,
    thumbnail: typeof raw.thumbnail === 'string' && raw.thumbnail.startsWith('data:image/') ? raw.thumbnail : undefined,
    defaults: sanitizeParams(raw.defaults, detected.defaults),
    limits: sanitizeLimits(raw.limits, detected.limits),
    description: typeof raw.description === 'string' ? raw.description : '',
    hasSign: raw.hasSign === true,
    aliases: Array.from(new Set(aliases)),
  };
  await putStored(rec);
  registerRecord(rec);
  return conflict ? { status: 'imported', remap: [requestedId, id] } : { status: 'imported' };
}

export async function importDocumentJson(text: string): Promise<ImportResult> {
  const raw = JSON.parse(text) as Record<string, unknown>;
  const bundles = Array.isArray(raw.customModels) ? (raw.customModels as CustomModelBundle[]) : [];

  let imported = 0;
  let reused = 0;
  const remaps = new Map<string, string>();
  for (const bundle of bundles) {
    try {
      const result = await importBundle(bundle);
      if (result.status === 'imported') imported++;
      else reused++;
      if (result.remap) remaps.set(result.remap[0], result.remap[1]);
    } catch (e) {
      console.warn('[customModels] pacote ignorado:', e);
    }
  }

  const remapList = (value: unknown) =>
    Array.isArray(value)
      ? value.map((item) => {
          const id = item && typeof item === 'object' ? (item as { modelId?: unknown }).modelId : null;
          const next = typeof id === 'string' ? remaps.get(id) : undefined;
          return next && item && typeof item === 'object' ? { ...item, modelId: next } : item;
        })
      : value;
  const base: Record<string, unknown> = { ...raw, buildings: remapList(raw.buildings), objects: remapList(raw.objects) };
  delete base.customModels;

  const entities = [
    ...(Array.isArray(base.buildings) ? base.buildings : []),
    ...(Array.isArray(base.objects) ? base.objects : []),
  ];
  const skipped = entities.filter((e) => {
    const id = e && typeof e === 'object' ? (e as { modelId?: unknown }).modelId : null;
    return typeof id === 'string' && !getModel(id);
  }).length;

  return { doc: validateDocument(base), imported, reused, skipped };
}
