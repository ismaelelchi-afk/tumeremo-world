import { useSyncExternalStore } from 'react';
import type { ModelDef } from '../core/types';
import { FEATURE_MODEL_DEFS } from './featureBusinesses';

/** Biblioteca inicial: solo los tres modelos de los comercios incorporados desde tumeremo-3d. */
export const MODEL_LIBRARY: ModelDef[] = [...FEATURE_MODEL_DEFS];

const BY_ID = new Map(MODEL_LIBRARY.map((m) => [m.id, m]));

/**
 * Registro dinâmico de modelos importados. Os modelos originais continuam intactos em
 * MODEL_LIBRARY; aqui só entram GLBs locais e seus apelidos (usados ao importar JSON).
 */
const CUSTOM = new Map<string, ModelDef>();
const ALIASES = new Map<string, string>();
const listeners = new Set<() => void>();
let ALL: ModelDef[] = [...MODEL_LIBRARY];

function rebuildAll() {
  ALL = [...MODEL_LIBRARY, ...CUSTOM.values()];
}

function emit() {
  listeners.forEach((l) => l());
}

/** Busca primeiro nos originais, depois nos importados e, por fim, nos apelidos. */
export const getModel = (id: string): ModelDef | undefined => {
  const direct = BY_ID.get(id) ?? CUSTOM.get(id);
  if (direct) return direct;
  const canonical = ALIASES.get(id);
  return canonical ? CUSTOM.get(canonical) : undefined;
};

/** Lista estável para a biblioteca (original + importados). */
export const getModelLibrary = (): ModelDef[] => ALL;

export function subscribeModels(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useModelLibrary(): ModelDef[] {
  return useSyncExternalStore(subscribeModels, getModelLibrary, getModelLibrary);
}

export function registerModel(def: ModelDef, aliases: string[] = []) {
  if (BY_ID.has(def.id)) throw new Error(`ID de modelo reservado: ${def.id}`);
  CUSTOM.set(def.id, def);
  addModelAliases([...aliases, def.id], def.id);
  rebuildAll();
  emit();
}

export function addModelAliases(aliases: string[], canonicalId: string) {
  let changed = false;
  for (const alias of aliases) {
    if (!alias || alias === canonicalId || BY_ID.has(alias) || CUSTOM.has(alias)) continue;
    if (ALIASES.get(alias) !== canonicalId) {
      ALIASES.set(alias, canonicalId);
      changed = true;
    }
  }
  if (changed) emit();
}

export function unregisterModel(id: string) {
  if (!CUSTOM.delete(id)) return;
  for (const [alias, canonical] of ALIASES) if (canonical === id) ALIASES.delete(alias);
  rebuildAll();
  emit();
}
