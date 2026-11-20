/** Traducción pura (sin React): útil en mensajes de datos, errores y persistencia. */
import { getLang } from './language';
import { es, type TranslationKey } from './locales/es';
import { ptBR } from './locales/ptBR';
import type { Lang, TranslateVars } from './types';

/** Busca la clave en el idioma pedido; si falta, cae al español y, por último, a la propia clave. */
export function translate(key: TranslationKey, vars?: TranslateVars): string;
export function translate(key: TranslationKey, lang: Lang | undefined, vars?: TranslateVars): string;
export function translate(key: TranslationKey, langOrVars?: Lang | TranslateVars, maybeVars?: TranslateVars): string {
  const lang: Lang = langOrVars === 'es' || langOrVars === 'pt-BR' ? langOrVars : getLang();
  const vars = langOrVars && typeof langOrVars === 'object' ? langOrVars : maybeVars;
  const table = (lang === 'pt-BR' ? ptBR : es) as Record<string, string>;
  let out = table[key] ?? (es as Record<string, string>)[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) out = out.split(`{${name}}`).join(String(value));
  }
  return out;
}

/** Error con clave de traducción: la UI muestra `t(e.key, e.vars)` en lugar del mensaje crudo. */
export class I18nError extends Error {
  constructor(
    public readonly key: TranslationKey,
    public readonly vars?: TranslateVars,
  ) {
    super(translate(key, getLang(), vars));
    this.name = 'I18nError';
  }
}

export const isI18nError = (e: unknown): e is I18nError => e instanceof I18nError;

export { type TranslationKey };
