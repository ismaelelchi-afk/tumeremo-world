/**
 * Enlaces profundos de WORLD y de la vista privada de `/usuario`: fragmentos
 * `#/item/<kind>/<id>` que restauran selección y cámara. Solo se parsean IDs
 * simples: un enlace externo nunca puede inyectar HTML ni rutas arbitrarias.
 */
import type { WorldSelection } from '../../core/types';

const PREFIX = '#/item/';
const KINDS = new Set(['place', 'building', 'business']);

/** Subconjunto seleccionable de `WorldSelection` (los tres tipos que pueden enlazarse). */
export type WorldLink = { kind: 'place' | 'building' | 'business'; id: string };

/** Devuelve la entidad enlazada o null si el hash no corresponde a un deep link válido. */
export function parseWorldHash(hash: string): WorldLink | null {
  if (!hash.startsWith(PREFIX)) return null;
  const [kind, rawId] = hash.slice(PREFIX.length).split('/');
  if (!kind || !KINDS.has(kind) || !rawId || !/^[a-zA-Z0-9_-]{1,80}$/.test(rawId)) return null;
  return { kind: kind as WorldLink['kind'], id: decodeURIComponent(rawId) };
}

export function worldHash(sel: WorldSelection): string {
  return `${PREFIX}${sel.kind}/${encodeURIComponent(sel.id)}`;
}

/** Estado guardado en el historial para poder restaurar la cámara al volver atrás. */
export interface WorldHistoryState {
  worldView?: { center: [number, number]; zoom: number; pitch: number; bearing: number };
  worldItem?: string;
}
