/** Formateo dependiente del idioma mediante Intl (números, fechas y horas). */
import { getLang } from './language';
import { translate } from './translate';
import type { Lang } from './types';

const intlLocale = (lang: Lang) => (lang === 'pt-BR' ? 'pt-BR' : 'es-VE');

/** Número con agrupadores y separador decimal del idioma activo. */
export function formatNumber(value: number, lang: Lang = getLang(), options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(intlLocale(lang), options).format(value);
}

/** Fecha legible (p. ej. «19/11/2026» en ES, «19 de nov. de 2026» en PT-BR). */
export function formatDate(value: string | number | Date, lang: Lang = getLang()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(intlLocale(lang), { dateStyle: 'medium' }).format(date);
}

/** Hora en formato corto (HH:mm). */
export function formatTime(value: string | number | Date, lang: Lang = getLang()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(intlLocale(lang), { hour: '2-digit', minute: '2-digit' }).format(date);
}

/** Distancia con unidad localizada y redondeo coherente con el mapa. */
export function formatMeters(meters: number, lang: Lang = getLang()): string {
  if (meters < 1000) {
    const value = formatNumber(Math.round(meters / 10) * 10, lang, { maximumFractionDigits: 0 });
    return `${value} ${translate('common.unit.m', lang)}`;
  }
  const value = formatNumber(meters / 1000, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${value} ${translate('common.unit.km', lang)}`;
}
