/**
 * Estado de idioma sin React. Permite que datos, persistencia y motor consulten el idioma
 * activo sin necesidad de pasar props por toda la aplicación.
 */
import type { Lang } from './types';

export const LANG_KEY = 'tumeremo-world:lang';
export const DEFAULT_LANG: Lang = 'es';

const isLang = (v: unknown): v is Lang => v === 'es' || v === 'pt-BR';

function initialLang(): Lang {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(LANG_KEY);
      if (isLang(saved)) return saved;
    }
  } catch {
    /* almacenamiento bloqueado: se usa el predeterminado */
  }
  return DEFAULT_LANG;
}

let current: Lang = initialLang();
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (!isLang(lang) || lang === current) return;
  current = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* la selección sigue activa en memoria aunque no se pueda persistir */
  }
  listeners.forEach((l) => l());
}

export function subscribeLang(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Solo para pruebas: restablece el módulo al idioma predeterminado. */
export function resetLangForTests(): void {
  current = DEFAULT_LANG;
  try {
    localStorage.removeItem(LANG_KEY);
  } catch {
    /* ignorar */
  }
  listeners.forEach((l) => l());
}
