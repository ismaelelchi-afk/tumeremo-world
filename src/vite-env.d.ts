import type { WorldDocument } from './core/types';
import type { PublicModelBundle } from './data/publicModels';

/** Defines inyectados por Vite en las entradas pública y privada. */
declare global {
  const __PUBLIC_WORLD_DOCUMENT__: WorldDocument;
  const __PUBLIC_WORLD_MODELS__: PublicModelBundle[];
  const __STUDIO_PUBLIC_WORLD_URL__: string | undefined;
}

export {};
