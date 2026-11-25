import type { ModelDef } from '../core/types';
import { registerModel } from './models';

export interface PublicModelBundle {
  id: string;
  aliases?: string[];
  name: string;
  category: ModelDef['category'];
  fileName: string;
  size: number;
  hash: string;
  createdAt?: string;
  thumbnail?: string;
  glb: string; // base64 sin prefijo data:
  defaults: ModelDef['defaults'];
  limits: ModelDef['limits'];
  description: string;
  hasSign?: boolean;
}

/** Múltiplo de 4 para no partir una terna base64 entre llamadas a `atob`. */
const BASE64_CHUNK = 0x8000;

function publicBundles(): PublicModelBundle[] {
  const injected =
    typeof __PUBLIC_WORLD_MODELS__ !== 'undefined'
      ? __PUBLIC_WORLD_MODELS__
      : (globalThis as typeof globalThis & { __PUBLIC_WORLD_MODELS__?: PublicModelBundle[] }).__PUBLIC_WORLD_MODELS__;
  if (!injected) return [];
  if (!Array.isArray(injected)) throw new Error('[publicModels] __PUBLIC_WORLD_MODELS__ debe ser un array');
  return injected;
}

function decodeGlb(base64: string, id: string): ArrayBuffer {
  const normalized = base64.replace(/\s+/g, '');
  if (!normalized) throw new Error(`[publicModels] Modelo "${id}": glb base64 vacío`);
  if (normalized.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error(`[publicModels] Modelo "${id}": glb base64 no válido`);
  }
  let binary = '';
  try {
    for (let offset = 0; offset < normalized.length; offset += BASE64_CHUNK) {
      binary += atob(normalized.slice(offset, offset + BASE64_CHUNK));
    }
  } catch {
    throw new Error(`[publicModels] Modelo "${id}": no se pudo decodificar el glb base64`);
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
}

function verifyHash(bundle: PublicModelBundle, buffer: ArrayBuffer): void {
  // En contextos inseguros `crypto.subtle` no existe: se omite la comprobación, sin bloquear.
  if (typeof crypto === 'undefined' || !crypto.subtle) return;
  void crypto.subtle
    .digest('SHA-256', buffer)
    .then((digest) => {
      const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (actual !== bundle.hash.trim().toLowerCase()) {
        console.warn(
          `[publicModels] Hash SHA-256 no coincide para "${bundle.id}" (${bundle.fileName}): ` +
            `declarado ${bundle.hash}, calculado ${actual}`,
        );
      }
    })
    .catch((error: unknown) => {
      console.warn(`[publicModels] No se pudo verificar el hash de "${bundle.id}"`, error);
    });
}

/** Registra los GLB públicos solo en memoria: sin IndexedDB ni ninguna escritura local. */
export function installPublicModels(): void {
  const bundles = publicBundles();
  const ids = new Set<string>();
  for (const bundle of bundles) {
    if (!bundle || typeof bundle !== 'object') {
      throw new Error('[publicModels] Entrada de modelo público no válida');
    }
    if (typeof bundle.id !== 'string' || !bundle.id.trim()) {
      throw new Error('[publicModels] Modelo público sin id');
    }
    if (ids.has(bundle.id)) {
      throw new Error(`[publicModels] ID de modelo público duplicado: ${bundle.id}`);
    }
    ids.add(bundle.id);
    if (!Number.isFinite(bundle.size) || bundle.size <= 0) {
      throw new Error(`[publicModels] Modelo "${bundle.id}": size debe ser mayor que cero`);
    }
    const buffer = decodeGlb(bundle.glb, bundle.id);
    if (buffer.byteLength === 0) {
      throw new Error(`[publicModels] Modelo "${bundle.id}": glb decodificado vacío`);
    }
    if (buffer.byteLength !== bundle.size) {
      console.warn(
        `[publicModels] Modelo "${bundle.id}": tamaño declarado ${bundle.size}, decodificado ${buffer.byteLength}`,
      );
    }

    const url = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }));
    const i18n = (bundle as PublicModelBundle & Pick<ModelDef, 'i18n'>).i18n;
    registerModel(
      {
        id: bundle.id,
        name: bundle.name,
        category: bundle.category,
        description: bundle.description,
        source: { type: 'glb', url },
        defaults: bundle.defaults,
        limits: bundle.limits,
        hasSign: bundle.hasSign,
        ...(i18n ? { i18n } : {}),
      },
      bundle.aliases ?? [],
    );
    verifyHash(bundle, buffer);
  }
}
