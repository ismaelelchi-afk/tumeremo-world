import type { Id } from './types';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Gera um identificador único com prefixo (ex.: `bld_k3j9d0az`). */
export function newId(prefix: 'bld' | 'obj' | 'biz' | 'plc' | 'mdl'): Id {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${prefix}_${out}`;
}

/** Hash estável e simples de string → inteiro positivo (para variações determinísticas). */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
