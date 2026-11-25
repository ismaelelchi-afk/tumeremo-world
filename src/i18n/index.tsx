import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { formatDate, formatMeters, formatNumber, formatTime } from './format';
import { getLang, setLang, subscribeLang } from './language';
import { translate, type TranslationKey } from './translate';
import type { Lang, TranslateVars } from './types';

export type { Lang, TranslateVars } from './types';
export type { TranslationKey } from './translate';
export { LANG_KEY, DEFAULT_LANG } from './language';
export { localized, localizedText, sanitizeLocalized, withLocalizedPatch, otherLang } from './localized';
export { formatDate, formatMeters, formatNumber, formatTime } from './format';
export { translate, I18nError, isI18nError } from './translate';

/** API expuesta por el provider. Todas las funciones quedan ligadas al idioma activo. */
export interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey, vars?: TranslateVars) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: string | number | Date) => string;
  formatTime: (value: string | number | Date) => string;
  formatMeters: (meters: number) => string;
}

function createApi(lang: Lang): I18n {
  return {
    lang,
    setLang,
    t: (key, vars) => translate(key, lang, vars),
    formatNumber: (value, options) => formatNumber(value, lang, options),
    formatDate: (value) => formatDate(value, lang),
    formatTime: (value) => formatTime(value, lang),
    formatMeters: (meters) => formatMeters(meters, lang),
  };
}

const Ctx = createContext<I18n | null>(null);
const fallbackApi = createApi(getLang());

/**
 * Proveedor global. Vive por encima de WORLD y STUDIO; el cambio de idioma se propaga a
 * las dos experiencias sin recargar. La descripción de STUDIO la fija `App.tsx` en la
 * entrada privada, así que aquí no se detecta ninguna ruta del editor.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribeLang, getLang, getLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.querySelector('meta[name="description"]')?.setAttribute('content', translate('app.description', lang));
  }, [lang]);

  const api = useMemo(() => createApi(lang), [lang]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/**
 * Acceso al idioma y a las funciones de traducción. Tiene un valor por defecto para que los
 * componentes también funcionen si se renderizan aislados (pruebas, SSR).
 */
export function useI18n(): I18n {
  return useContext(Ctx) ?? fallbackApi;
}
