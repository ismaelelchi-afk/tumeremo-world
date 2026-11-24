import type { Business, WorldDocument } from '../../core/types';

export const publishedBusinesses = (doc: WorldDocument): Business[] => doc.businesses.filter((b) => b.published);

export const businessesOf = (doc: WorldDocument, buildingId: string, onlyPublished = true): Business[] =>
  doc.businesses.filter((b) => b.buildingId === buildingId && (!onlyPublished || b.published));
