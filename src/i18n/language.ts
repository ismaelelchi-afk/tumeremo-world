/**
 * Estado de idioma sin React y SIN persistencia. La persistencia se instala solo en la
 * entrada privada (`languagePersistence.ts`), de modo que el bundle público no contiene
 * ninguna escritura en localStorage.
 */
import type { Lang } from './types';

export const LANG_KEY = 'tumeremo-world:lang';
export const DEFAULT_LANG: Lang = 'es';

const isLang = (v: unknown): v is Lang => v === 'es' || v === 'pt-BR';

let current: Lang = DEFAULT_LANG;
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (!isLang(lang) || lang === current) return;
  current = lang;
  listeners.forEach((l) => l());
}

export function subscribeLang(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Solo para pruebas: restablece el módulo al idioma predeterminado. */
export function resetLangForTests(): void {
  current = DEFAULT_LANG;
  listeners.forEach((l) => l());
}
