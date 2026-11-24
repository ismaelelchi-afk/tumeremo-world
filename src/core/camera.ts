/**
 * Cálculo único del encuadre de cámara. Lo usan el WORLD público, la vista previa del STUDIO
 * y el sistema de órbita: así un edificio se enfoca igual en los tres sitios.
 */
import { resolveAnimation } from './animation';
import { clamp, normalizeDegrees } from './geo';
import type { WorldDocument } from './types';

export type FocusRef = { kind: 'place' | 'building' | 'object' | 'business'; id: string };

export interface FocusView {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
  duration: number;
  padding: { top: number; bottom: number; left: number; right: number };
}

export interface FocusInput {
  doc: WorldDocument;
  ref: FocusRef;
  current: { zoom: number; pitch: number; bearing: number };
  /** Espacio reservado abajo para la hoja de detalles (móvil). */
  paddingBottom: number;
}

/** Devuelve el encuadre final o null si la entidad ya no existe en el documento. */
export function computeFocusView({ doc, ref, current, paddingBottom }: FocusInput): FocusView | null {
  const place = ref.kind === 'place' ? doc.places?.find((p) => p.id === ref.id) : undefined;
  const entity =
    ref.kind === 'building'
      ? doc.buildings.find((b) => b.id === ref.id)
      : ref.kind === 'object'
        ? doc.objects.find((o) => o.id === ref.id)
        : ref.kind === 'business'
          ? doc.buildings.find((b) => b.id === doc.businesses.find((biz) => biz.id === ref.id)?.buildingId)
          : undefined;
  const position = place?.position ?? entity?.placement.position;
  if (!position) return null;

  const anim = resolveAnimation(doc.animation, entity?.animation ?? place?.animation);
  const padding = { top: 0, bottom: paddingBottom, left: 0, right: 0 };

  if (!entity) {
    // Los Puntos son marcadores 2D: nunca cambian de fachada y solo aplican ajustes explícitos.
    const focus = place?.animation?.focus;
    return {
      center: [position.lng, position.lat],
      zoom: clamp(Math.max(current.zoom, 17.6) - Math.log2(anim.focus.distanceScale), 15, 21),
      pitch: focus?.pitch ?? current.pitch,
      bearing: focus?.bearingOffset != null ? normalizeDegrees(focus.bearingOffset) : current.bearing,
      duration: focus?.durationMs ?? 1400,
      padding,
    };
  }

  const footprint = Math.hypot(entity.params.width, entity.params.depth) * entity.placement.scale;
  const distance = clamp(20 + entity.params.height * 1.7 + footprint * 1.3, 28, 62) + (paddingBottom > 0 ? 8 : 0);
  const halfFovTan = Math.tan((36.87 * Math.PI) / 360);
  const metersPerPixel = distance / (Math.max(320, typeof window === 'undefined' ? 720 : window.innerHeight) * 0.5 / halfFovTan);
  const zoom = clamp(
    Math.log2((78271.516 * Math.cos((position.lat * Math.PI) / 180)) / metersPerPixel) - Math.log2(anim.focus.distanceScale),
    18.6,
    21,
  );
  return {
    center: [position.lng, position.lat],
    zoom,
    pitch: anim.focus.pitch,
    bearing: normalizeDegrees(entity.placement.heading + anim.focus.bearingOffset),
    duration: anim.focus.durationMs,
    padding,
  };
}
