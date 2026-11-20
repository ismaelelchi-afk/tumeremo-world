/**
 * Acceso a los textos localizados incrustados en los datos (descripciones, horarios, nombres
 * descriptivos). El campo canónico original siempre es el último recurso, de modo que los
 * documentos antiguos siguen funcionando sin migración.
 */
import type { HasLocalizedTexts, Lang, Localized, LocalizedTexts } from './types';

export function otherLang(lang: Lang): Lang {
  return lang === 'es' ? 'pt-BR' : 'es';
}

/** Devuelve la variante del idioma, luego la del otro idioma y, por último, el campo original. */
export function localized<T extends HasLocalizedTexts, K extends keyof LocalizedTexts>(
  entity: T,
  field: K,
  lang: Lang,
): string | undefined {
  const own = entity.i18n?.[lang]?.[field];
  if (typeof own === 'string') return own;
  const alt = entity.i18n?.[otherLang(lang)]?.[field];
  if (typeof alt === 'string') return alt;
  const base = (entity as unknown as Record<string, unknown>)[field as string];
  return typeof base === 'string' ? base : undefined;
}

/** Igual que `localized`, con cadena vacía como valor seguro para inputs. */
export function localizedText<T extends HasLocalizedTexts, K extends keyof LocalizedTexts>(
  entity: T,
  field: K,
  lang: Lang,
): string {
  return localized(entity, field, lang) ?? '';
}

/** Sanitiza un bloque `i18n` proveniente de JSON, conservando solo idiomas y campos conocidos. */
export function sanitizeLocalized(raw: unknown): Localized<LocalizedTexts> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: Localized<LocalizedTexts> = {};
  for (const lang of ['es', 'pt-BR'] as Lang[]) {
    const block = r[lang];
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
    const b = block as Record<string, unknown>;
    const texts: LocalizedTexts = {};
    if (typeof b.name === 'string') texts.name = b.name;
    if (typeof b.description === 'string') texts.description = b.description;
    if (typeof b.hours === 'string') texts.hours = b.hours;
    if (Object.keys(texts).length) out[lang] = texts;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Mezcla los campos de texto modificados en la variante del idioma activo, sin borrar la del
 * otro idioma. Se usa al editar en el STUDIO para que el cambio se vea al cambiar de idioma.
 */
export function withLocalizedPatch<T extends HasLocalizedTexts>(entity: T, patch: Record<string, unknown>, lang: Lang): T {
  const texts: LocalizedTexts = {};
  if (typeof patch.name === 'string') texts.name = patch.name;
  if (typeof patch.description === 'string') texts.description = patch.description;
  if (typeof patch.hours === 'string') texts.hours = patch.hours;
  if (!Object.keys(texts).length) return entity;
  const i18n: Localized<LocalizedTexts> = {
    ...entity.i18n,
    [lang]: { ...entity.i18n?.[lang], ...texts },
  };
  return { ...entity, i18n };
}
