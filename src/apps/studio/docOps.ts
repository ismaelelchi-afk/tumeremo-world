import { newId } from '../../core/ids';
import { getLang } from '../../i18n/language';
import { localizedText, withLocalizedPatch } from '../../i18n/localized';
import { translate } from '../../i18n/translate';
import type { Lang } from '../../i18n/types';
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
  let copy = {
    ...JSON.parse(JSON.stringify(src)),
    id: newId(ref.kind === 'building' ? 'bld' : 'obj'),
    origin: 'studio',
  } as Entity3D;
  // El sufijo «copia» debe existir en los dos idiomas, no solo en el activo al duplicar.
  for (const other of ['es', 'pt-BR'] as Lang[]) {
    copy = withLocalizedPatch(copy, { name: `${localizedText(src, 'name', other)}${translate('props.copySuffix', other)}` }, other);
  }
  copy.name = localizedText(copy, 'name', lang);
  copy.placement.position = { lng: src.placement.position.lng + 0.0001, lat: src.placement.position.lat - dLat };
  return { doc: addEntity(doc, copy), ref: { kind: copy.kind, id: copy.id } };
}

export function findPlace(doc: WorldDocument, id: string): Place | undefined {
  return doc.places?.find((p) => p.id === id);
}

/** Crea un punto geográfico independiente: sin edificio, sin comercio y sin referencias. */
export function createPlace(position: LngLat): Place {
  return {
    id: newId('plc'),
    name: translate('points.newName'),
    category: 'other',
    position: { ...position },
    description: '',
    source: { type: 'manual', note: translate('points.manualNote') },
    visible: true,
    icon: 'pin',
  };
}

/** Agrega un punto sin tocar edificios, objetos ni comercios. */
export function addPlace(doc: WorldDocument, place: Place): WorldDocument {
  return { ...doc, places: [...(doc.places ?? []), place] };
}

/** Duplica un punto desplazándolo mínimamente: el original nunca se mueve ni se renombra. */
export function duplicatePlace(doc: WorldDocument, id: string): { doc: WorldDocument; id: string } | null {
  const src = findPlace(doc, id);
  if (!src) return null;
  const lang = getLang();
  let copy = JSON.parse(JSON.stringify(src)) as Place;
  copy.id = newId('plc');
  for (const other of ['es', 'pt-BR'] as Lang[]) {
    copy = withLocalizedPatch(copy, { name: `${localizedText(src, 'name', other)}${translate('props.copySuffix', other)}` }, other);
  }
  copy.name = localizedText(copy, 'name', lang);
  copy.position = { lng: src.position.lng + 0.0001, lat: src.position.lat - 0.00008 };
  // Una copia es contenido nuevo del STUDIO: no hereda la procedencia OSM del original.
  copy.source = { type: 'manual', note: translate('points.manualNote') };
  return { doc: addPlace(doc, copy), id: copy.id };
}

export type PlacePatch = Partial<
  Pick<
    Place,
    | 'name'
    | 'description'
    | 'category'
    | 'icon'
    | 'visible'
    | 'position'
    | 'size'
    | 'color'
    | 'strokeColor'
    | 'opacity'
    | 'label'
    | 'showLabel'
    | 'animation'
  >
>;

/** Edita um ponto existente sem criar duplicatas nem tocar em construções/objetos. */
export function patchPlace(doc: WorldDocument, id: string, patch: PlacePatch): WorldDocument {
  if (!doc.places?.some((p) => p.id === id)) return doc;
  const lang = getLang();
  return { ...doc, places: doc.places.map((p) => (p.id === id ? withLocalizedPatch({ ...p, ...patch }, patch, lang) : p)) };
}

/** Elimina un punto y registra la baja para que la semilla no lo reincorpore al recargar. */
export function removePlace(doc: WorldDocument, id: string): WorldDocument {
  if (!doc.places?.some((p) => p.id === id)) return doc;
  const removedPlaceIds = doc.removedPlaceIds?.includes(id) ? doc.removedPlaceIds : [...(doc.removedPlaceIds ?? []), id];
  return { ...doc, places: doc.places.filter((p) => p.id !== id), removedPlaceIds };
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

/** Duplica un comercio sin publicarlo: la copia empieza como borrador del STUDIO. */
export function duplicateBusiness(doc: WorldDocument, id: string): { doc: WorldDocument; id: string } | null {
  const src = doc.businesses.find((b) => b.id === id);
  if (!src) return null;
  const lang = getLang();
  let copy = JSON.parse(JSON.stringify(src)) as Business;
  copy.id = newId('biz');
  for (const other of ['es', 'pt-BR'] as Lang[]) {
    copy = withLocalizedPatch(copy, { name: `${localizedText(src, 'name', other)}${translate('props.copySuffix', other)}` }, other);
  }
  copy.name = localizedText(copy, 'name', lang);
  copy.published = false;
  copy.origin = 'studio';
  return { doc: { ...doc, businesses: [...doc.businesses, copy] }, id: copy.id };
}

export function patchBusiness(doc: WorldDocument, id: string, patch: Partial<Business>): WorldDocument {
  const lang = getLang();
  return { ...doc, businesses: doc.businesses.map((b) => (b.id === id ? withLocalizedPatch({ ...b, ...patch }, patch, lang) : b)) };
}

export function removeBusiness(doc: WorldDocument, id: string): WorldDocument {
  return { ...doc, businesses: doc.businesses.filter((b) => b.id !== id) };
}
