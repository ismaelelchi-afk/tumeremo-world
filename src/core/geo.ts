import { formatNumber } from '../i18n/format';
import type { Lang } from '../i18n/types';
import type { LngLat } from './types';

export { formatMeters } from '../i18n/format';

const DEG = Math.PI / 180;

/** Metros por grau de longitude/latitude na latitude dada (aproximação suficiente para escala urbana). */
export function metersPerDegree(lat: number): { x: number; y: number } {
  return { x: 111320 * Math.cos(lat * DEG), y: 110574 };
}

export function distanceMeters(a: LngLat, b: LngLat): number {
  const k = metersPerDegree((a.lat + b.lat) / 2);
  return Math.hypot((a.lng - b.lng) * k.x, (a.lat - b.lat) * k.y);
}

/** Rumo (graus horários a partir do norte, 0..360) de a até b. */
export function bearingDegrees(a: LngLat, b: LngLat): number {
  const k = metersPerDegree((a.lat + b.lat) / 2);
  const dx = (b.lng - a.lng) * k.x;
  const dy = (b.lat - a.lat) * k.y;
  return normalizeDegrees(Math.atan2(dx, dy) / DEG);
}

export function normalizeDegrees(d: number): number {
  return ((d % 360) + 360) % 360;
}

/** Ponto do segmento ab mais próximo de p (em metros locais). */
export function nearestOnSegment(p: LngLat, a: LngLat, b: LngLat): { point: LngLat; distance: number } {
  const k = metersPerDegree(p.lat);
  const ax = (a.lng - p.lng) * k.x;
  const ay = (a.lat - p.lat) * k.y;
  const bx = (b.lng - p.lng) * k.x;
  const by = (b.lat - p.lat) * k.y;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : -(ax * dx + ay * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return {
    point: { lng: p.lng + qx / k.x, lat: p.lat + qy / k.y },
    distance: Math.hypot(qx, qy),
  };
}

/** Coordenadas con 5 decimales y separador decimal del idioma activo (Intl). */
export function formatCoords(p: LngLat, lang?: Lang): string {
  const opts: Intl.NumberFormatOptions = { minimumFractionDigits: 5, maximumFractionDigits: 5 };
  return `${formatNumber(p.lat, lang, opts)}°, ${formatNumber(p.lng, lang, opts)}°`;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Normaliza texto para busca (minúsculas, sem acentos). */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
