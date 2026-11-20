import { newId } from '../../core/ids';
import { getLang } from '../../i18n/language';
import { localizedText, withLocalizedPatch } from '../../i18n/localized';
import { translate } from '../../i18n/translate';
import type {
  Business,
  CustomBuilding,
  EntityRef,
  Entity3D,
  LngLat,
  ModelDef,
  Place,
  Placement,
  WorldDocument,
  WorldObject3D,
} from '../../core/types';

/** Operações puras sobre o WorldDocument. O STUDIO as aplica via documentStore.update(). */

export function findEntity(doc: WorldDocument, ref: EntityRef): Entity3D | undefined {
  return ref.kind === 'building' ? doc.buildings.find((b) => b.id === ref.id) : doc.objects.find((o) => o.id === ref.id);
}

export function createEntity(model: ModelDef, position: LngLat, heading: number): CustomBuilding | WorldObject3D {
  const placement: Placement = { position, heading, scale: 1 };
  const params = { ...model.defaults };
  const name = localizedText(model, 'name', getLang());
  if (model.category === 'building') {
    return {
      id: newId('bld'),
      kind: 'building',
      name,
      modelId: model.id,
      placement,
      params,
      description: '',
      placeId: null,
      visible: true,
      origin: 'studio',
    };
  }
  return { id: newId('obj'), kind: 'object', name, modelId: model.id, placement, params, visible: true, origin: 'studio' };
}

export function addEntity(doc: WorldDocument, e: CustomBuilding | WorldObject3D): WorldDocument {
  return e.kind === 'building' ? { ...doc, buildings: [...doc.buildings, e] } : { ...doc, objects: [...doc.objects, e] };
}

type EntityPatch = Partial<Omit<CustomBuilding, 'id' | 'kind' | 'placement'>> &
  Partial<Omit<WorldObject3D, 'id' | 'kind' | 'placement'>> & { placement?: Partial<Placement> };

export function patchEntity(doc: WorldDocument, ref: EntityRef, patch: EntityPatch): WorldDocument {
  const apply = <T extends Entity3D>(e: T): T =>
    e.id !== ref.id
      ? e
      : withLocalizedPatch(
          {
            ...e,
            ...patch,
            placement: { ...e.placement, ...(patch.placement ?? {}) },
            params: { ...e.params, ...(patch.params ?? {}) },
          } as T,
          patch,
          getLang(),
        );
  return ref.kind === 'building' ? { ...doc, buildings: doc.buildings.map(apply) } : { ...doc, objects: doc.objects.map(apply) };
}

export function removeEntity(doc: WorldDocument, ref: EntityRef): WorldDocument {
  if (ref.kind === 'object') return { ...doc, objects: doc.objects.filter((o) => o.id !== ref.id) };
  return {
    ...doc,
    buildings: doc.buildings.filter((b) => b.id !== ref.id),
    // a relação vive no comércio: sem o edifício, o comércio fica "sem edifício"
    businesses: doc.businesses.map((b) => (b.buildingId === ref.id ? { ...b, buildingId: null } : b)),
  };
}

export function duplicateEntity(doc: WorldDocument, ref: EntityRef): { doc: WorldDocument; ref: EntityRef } | null {
  const src = findEntity(doc, ref);
  if (!src) return null;
  const dLat = 0.00015;
  const lang = getLang();
  const copyName = `${localizedText(src, 'name', lang)}${translate('props.copySuffix', lang)}`;
  const copy = withLocalizedPatch(
    {
      ...JSON.parse(JSON.stringify(src)),
      id: newId(ref.kind === 'building' ? 'bld' : 'obj'),
      name: copyName,
      origin: 'studio',
    } as Entity3D,
    { name: copyName },
    lang,
  );
  copy.placement.position = { lng: src.placement.position.lng + 0.0001, lat: src.placement.position.lat - dLat };
  return { doc: addEntity(doc, copy), ref: { kind: copy.kind, id: copy.id } };
}

export function findPlace(doc: WorldDocument, id: string): Place | undefined {
  return doc.places?.find((p) => p.id === id);
}

export type PlacePatch = Partial<Pick<Place, 'name' | 'description' | 'category' | 'icon' | 'visible' | 'position'>>;

/** Edita um ponto existente sem criar duplicatas nem tocar em construções/objetos. */
export function patchPlace(doc: WorldDocument, id: string, patch: PlacePatch): WorldDocument {
  if (!doc.places?.some((p) => p.id === id)) return doc;
  const lang = getLang();
  return { ...doc, places: doc.places.map((p) => (p.id === id ? withLocalizedPatch({ ...p, ...patch }, patch, lang) : p)) };
}

export function createBusiness(buildingId: string | null): Business {
  return {
    id: newId('biz'),
    name: translate('business.newName'),
    category: 'other',
    description: '',
    hours: '',
    phone: '',
    whatsapp: '',
    instagram: '',
    color: '#e8b34b',
    buildingId,
    published: false,
    origin: 'studio',
  };
}

export function patchBusiness(doc: WorldDocument, id: string, patch: Partial<Business>): WorldDocument {
  const lang = getLang();
  return { ...doc, businesses: doc.businesses.map((b) => (b.id === id ? withLocalizedPatch({ ...b, ...patch }, patch, lang) : b)) };
}

export function removeBusiness(doc: WorldDocument, id: string): WorldDocument {
  return { ...doc, businesses: doc.businesses.filter((b) => b.id !== id) };
}
