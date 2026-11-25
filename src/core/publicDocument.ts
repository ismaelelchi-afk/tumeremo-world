import type { WorldDocument } from '../core/types';

declare const __PUBLIC_WORLD_DOCUMENT__: WorldDocument;

function injectedDocument(): WorldDocument {
  const value =
    typeof __PUBLIC_WORLD_DOCUMENT__ !== 'undefined'
      ? __PUBLIC_WORLD_DOCUMENT__
      : (globalThis as typeof globalThis & { __PUBLIC_WORLD_DOCUMENT__?: WorldDocument }).__PUBLIC_WORLD_DOCUMENT__;
  if (!value) {
    throw new Error(
      '[publicDocument] Falta el documento público. Genera data/world.public.json con "npm run prepare:world -- <export.json>" y compila con "npm run build:public". No se usa la semilla vacía como sustituto.',
    );
  }
  return value;
}

export const PUBLIC_DOCUMENT: WorldDocument = injectedDocument();
