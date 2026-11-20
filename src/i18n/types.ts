/** Tipos base del sistema bilingüe. Sin dependencias de React para poder usarse en datos y motor. */

/** Idiomas soportados. `es` es el predeterminado. */
export type Lang = 'es' | 'pt-BR';

/** Texto con una variante independiente por idioma. */
export type Localized<T> = Partial<Record<Lang, T>>;

/** Campos de texto editables que pueden tener variante por idioma. */
export interface LocalizedTexts {
  name?: string;
  description?: string;
  hours?: string;
}

/** Contrato mínimo de una entidad que puede llevar texto localizado. */
export interface HasLocalizedTexts {
  i18n?: Localized<LocalizedTexts>;
}

/** Variables para interpolación `{nombre}` en los catálogos. */
export type TranslateVars = Record<string, string | number>;
