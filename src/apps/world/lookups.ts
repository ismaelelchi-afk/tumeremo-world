import { distanceMeters } from '../../core/geo';
import type { Business, CustomBuilding, LngLat, Place, WorldDocument } from '../../core/types';

export const publishedBusinesses = (doc: WorldDocument): Business[] => doc.businesses.filter((b) => b.published);

export const businessesOf = (doc: WorldDocument, buildingId: string, onlyPublished = true): Business[] =>
  doc.businesses.filter((b) => b.buildingId === buildingId && (!onlyPublished || b.published));

export function nearestPlace(places: Place[], p: LngLat): { place: Place; meters: number } | null {
  let best: { place: Place; meters: number } | null = null;
  for (const pl of places) {
    const d = distanceMeters(p, pl.position);
    if (!best || d < best.meters) best = { place: pl, meters: d };
  }
  return best;
}

export function nearbyBuildings(doc: WorldDocument, p: LngLat, radius: number): Array<{ building: CustomBuilding; meters: number }> {
  return doc.buildings
    .filter((b) => b.visible)
    .map((b) => ({ building: b, meters: distanceMeters(p, b.placement.position) }))
    .filter((x) => x.meters <= radius && x.meters > 0.5)
    .sort((a, b) => a.meters - b.meters);
}
