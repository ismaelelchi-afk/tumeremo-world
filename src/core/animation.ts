/**
 * Configuración de animaciones compartida por WORLD y STUDIO.
 *
 * El documento guarda unos valores generales (`WorldDocument.animation`) y cada entidad
 * puede guardar un override parcial (`animation` en edificios, objetos y Puntos). La
 * configuración efectiva se resuelve con `resolveAnimation`: lo que no está personalizado
 * hereda el valor general. Así, cambiar los generales nunca sobrescribe personalizaciones
 * individuales, y «Restablecer a general» consiste simplemente en quitar el override.
 *
 * Todas las opciones son de cámara: ninguna modifica coordenadas, geometría ni la fachada
 * real de los modelos.
 */

export interface OrbitAnimation {
  /** Multiplicador de la distancia de observación. 1 = encuadre calculado; 1.25 = +25 %. */
  distanceScale: number;
  /** Multiplicador de la altura usada para calcular la elevación (pitch). */
  altitudeScale: number;
  /** Duración de la vuelta completa de 360°. */
  durationMs: number;
}

export interface FocusAnimation {
  /**
   * Giro final respecto al `heading` de la fachada. 180 sitúa la cámara frente a la fachada;
   * 0 la sitúa detrás. En Puntos (sin heading) se usa como bearing absoluto.
   */
  bearingOffset: number;
  /** Inclinación final de la cámara, en grados. */
  pitch: number;
  /** Multiplicador de la distancia final del acercamiento. */
  distanceScale: number;
  /** Duración del vuelo final de acercamiento. */
  durationMs: number;
}

export interface WorldAnimationConfig {
  orbit: OrbitAnimation;
  focus: FocusAnimation;
}

/** Override parcial: solo los campos presentes sustituyen al valor general. */
export interface AnimationOverrides {
  orbit?: Partial<OrbitAnimation>;
  focus?: Partial<FocusAnimation>;
}

export const ANIMATION_LIMITS = {
  orbit: {
    // 1 = encuadre calculado (el tope de zoom impide acercar más); > 1 aleja.
    // Hasta 100×: el zoom resultante respeta el minZoom del mapa y `closest` evita
    // que la cámara atraviese el modelo, así el objetivo sigue centrado y seguro.
    distanceScale: [1, 100] as const,
    altitudeScale: [0.5, 2] as const,
    durationMs: [4000, 30000] as const,
  },
  focus: {
    bearingOffset: [-180, 180] as const,
    pitch: [20, 70] as const,
    distanceScale: [1, 2.5] as const,
    durationMs: [300, 4000] as const,
  },
} as const;

/** Valores iniciales: conservan el comportamiento previo excepto la fachada final, que se corrige. */
export const ANIMATION_DEFAULTS: WorldAnimationConfig = {
  orbit: { distanceScale: 1.25, altitudeScale: 1, durationMs: 12000 },
  focus: { bearingOffset: 180, pitch: 62, distanceScale: 1, durationMs: 1200 },
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const rec = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const num = (v: unknown, fallback: number, range: readonly [number, number]): number =>
  isNum(v) ? Math.min(range[1], Math.max(range[0], v)) : fallback;

/** Normaliza cualquier documento (incluidos los antiguos, sin el bloque) a una configuración completa. */
export function sanitizeAnimation(raw: unknown): WorldAnimationConfig {
  const r = rec(raw);
  const o = rec(r?.orbit) ?? {};
  const f = rec(r?.focus) ?? {};
  const d = ANIMATION_DEFAULTS;
  const l = ANIMATION_LIMITS;
  return {
    orbit: {
      distanceScale: num(o.distanceScale, d.orbit.distanceScale, l.orbit.distanceScale),
      altitudeScale: num(o.altitudeScale, d.orbit.altitudeScale, l.orbit.altitudeScale),
      durationMs: num(o.durationMs, d.orbit.durationMs, l.orbit.durationMs),
    },
    focus: {
      bearingOffset: num(f.bearingOffset, d.focus.bearingOffset, l.focus.bearingOffset),
      pitch: num(f.pitch, d.focus.pitch, l.focus.pitch),
      distanceScale: num(f.distanceScale, d.focus.distanceScale, l.focus.distanceScale),
      durationMs: num(f.durationMs, d.focus.durationMs, l.focus.durationMs),
    },
  };
}

/** Normaliza un override; descarta claves desconocidas y valores no finitos. */
export function sanitizeAnimationOverrides(raw: unknown): AnimationOverrides | undefined {
  const r = rec(raw);
  if (!r) return undefined;
  const out: AnimationOverrides = {};
  const l = ANIMATION_LIMITS;

  const o = rec(r.orbit);
  if (o) {
    const part: Partial<OrbitAnimation> = {};
    if (isNum(o.distanceScale)) part.distanceScale = num(o.distanceScale, 1, l.orbit.distanceScale);
    if (isNum(o.altitudeScale)) part.altitudeScale = num(o.altitudeScale, 1, l.orbit.altitudeScale);
    if (isNum(o.durationMs)) part.durationMs = num(o.durationMs, 12000, l.orbit.durationMs);
    if (Object.keys(part).length) out.orbit = part;
  }

  const f = rec(r.focus);
  if (f) {
    const part: Partial<FocusAnimation> = {};
    if (isNum(f.bearingOffset)) part.bearingOffset = num(f.bearingOffset, 180, l.focus.bearingOffset);
    if (isNum(f.pitch)) part.pitch = num(f.pitch, 62, l.focus.pitch);
    if (isNum(f.distanceScale)) part.distanceScale = num(f.distanceScale, 1, l.focus.distanceScale);
    if (isNum(f.durationMs)) part.durationMs = num(f.durationMs, 1200, l.focus.durationMs);
    if (Object.keys(part).length) out.focus = part;
  }

  return Object.keys(out).length ? out : undefined;
}

/** Devuelve `true` cuando la entidad tiene al menos un valor personalizado. */
export function hasAnimationOverrides(overrides: AnimationOverrides | undefined): boolean {
  const clean = sanitizeAnimationOverrides(overrides);
  return !!clean && Object.keys(clean).some((k) => Object.keys(clean[k as keyof AnimationOverrides] ?? {}).length > 0);
}

/** Configuración efectiva: general + override individual. */
export function resolveAnimation(
  general: WorldAnimationConfig | undefined,
  overrides?: AnimationOverrides,
): WorldAnimationConfig {
  const base = sanitizeAnimation(general);
  const ov = sanitizeAnimationOverrides(overrides);
  return {
    orbit: { ...base.orbit, ...(ov?.orbit ?? {}) },
    focus: { ...base.focus, ...(ov?.focus ?? {}) },
  };
}
