import type { Place, VisualConfig } from '../core/types';

/** GeoJSON de los lugares visibles. Función pura: la usan WORLD y STUDIO a través del motor. */
export function placesGeoJson(places: Place[] | undefined, colors: VisualConfig['placeColors']) {
  return {
    type: 'FeatureCollection' as const,
    features: (places ?? [])
      .filter((p) => p.visible !== false)
      .map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.position.lng, p.position.lat] as [number, number] },
        properties: {
          id: p.id,
          name: p.name,
          color: colors[p.category] ?? colors.other,
          icon: p.icon ?? '',
        },
      })),
  };
}
