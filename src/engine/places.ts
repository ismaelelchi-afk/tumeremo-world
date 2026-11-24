import type { Place, VisualConfig } from '../core/types';

/**
 * GeoJSON de los lugares visibles. Función pura: la usan WORLD y STUDIO a través del motor.
 * `hiddenIds` es un filtro de presentación por identificador; no modifica el documento.
 */
export function placesGeoJson(
  places: Place[] | undefined,
  colors: VisualConfig['placeColors'],
  hiddenIds?: ReadonlySet<string>,
) {
  return {
    type: 'FeatureCollection' as const,
    features: (places ?? [])
      .filter((p) => p.visible !== false && !hiddenIds?.has(p.id))
      .map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.position.lng, p.position.lat] as [number, number] },
        properties: {
          id: p.id,
          name: p.name,
          color: p.color ?? colors[p.category] ?? colors.other,
          icon: p.icon ?? '',
          ...(p.size !== undefined ? { size: p.size } : {}),
          ...(p.strokeColor !== undefined ? { strokeColor: p.strokeColor } : {}),
          ...(p.opacity !== undefined ? { opacity: p.opacity } : {}),
          ...(p.label ? { label: p.label } : {}),
          ...(p.showLabel !== undefined ? { showLabel: p.showLabel } : {}),
        },
      })),
  };
}
