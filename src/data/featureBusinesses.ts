/**
 * FUENTE CANÓNICA de los tres comercios oficiales incorporados desde tumeremo-3d.
 *
 * Aquí viven, una sola vez:
 *  - las definiciones de modelo procedural (`FEATURE_MODEL_DEFS`);
 *  - los edificios y negocios incorporados al WorldDocument compartido
 *    (`FEATURE_BUILDINGS`, `FEATURE_BUSINESSES`);
 *  - los perfiles comerciales originales con sus fotografías (`FEATURE_PROFILES`);
 *  - la composición de la ficha de WORLD (`composeWorldBusinessProfile`).
 *
 * Los modelos se incluyen en `MODEL_LIBRARY` (ver `data/models.ts`), por lo que están
 * registrados desde el arranque, antes de que `core/repository.ts` valide cualquier
 * documento guardado. No dependen de que WORLD esté abierto.
 *
 * Los datos son los publicados en `tumeremo-3d/src/data/negocios.json`; ese proyecto
 * es exclusivamente de lectura. Las coordenadas se derivan de forma determinista de
 * las coordenadas locales en metros y del origen real del mapa (Plaza Bolívar).
 */
import { metersPerDegree } from '../core/geo';
import { businessCategoryLabel } from '../core/labels';
import type { Business, CustomBuilding, LngLat, ModelDef, ModelParams } from '../core/types';
import { WORLD_ORIGIN } from '../geo/geography';
import type { Lang } from '../i18n/types';

export interface WorldBusinessContact {
  phone: string;
  whatsapp: string;
  instagram: string;
  email: string;
}

/**
 * Estructura preparada para la vitrina. `negocios.json` NO contiene catálogo para
 * estos tres comercios, por lo que las listas se entregan vacías: no se inventan
 * productos, precios ni promociones.
 */
export interface WorldCatalogEntry {
  id: string;
  name: string;
  description?: string;
  image?: string;
  price?: string;
  badge?: string;
}

export interface WorldBusinessProfile {
  /** ID del edificio, que es la clave de selección usada por WORLD. */
  buildingId: string;
  /** ID del comercio en el documento aumentado de WORLD. */
  businessId: string;
  name: string;
  sign: string;
  /** Valor original del campo `categoria` en la fuente. */
  category: 'comida' | 'tecnologia' | 'ropa';
  categoryLabels: Record<Lang, string>;
  /** Emoji de la categoría original en `tumeremo-3d/src/data/categorias.ts`. */
  emoji: string;
  slogan: string;
  description: string;
  address: string;
  hours: string;
  rating: number;
  tags: string[];
  photos: string[];
  contact: WorldBusinessContact;
  products: WorldCatalogEntry[];
  promotions: WorldCatalogEntry[];
  /** Colores originales del edificio, para mantener la identidad de cada negocio. */
  accent: string;
  facade: string;
  roof: string;
}

/**
 * Ficha usada por la vista pública de WORLD. Los campos que STUDIO puede editar
 * (`name`, `description`, `hours`, contactos, `color` y `category`) se leen del
 * `Business` del documento compartido; el resto se toma del perfil original.
 */
export interface ComposedWorldBusinessProfile
  extends Omit<WorldBusinessProfile, 'name' | 'category' | 'categoryLabels' | 'description' | 'hours' | 'contact' | 'accent'> {
  name: string;
  description: string;
  hours: string;
  contact: WorldBusinessContact;
  /** Color editable del `Business`; el original del edificio sigue en `facade`/`roof`. */
  accent: string;
  /** Etiqueta derivada de `Business.category`, ya resuelta para cada idioma. */
  categoryLabels: Record<Lang, string>;
  /** Categoría literal de la fuente, conservada para el tooltip informativo. */
  originalCategory: WorldBusinessProfile['category'];
}

/** Una única entrada por comercio: modelo, edificio, negocio y perfil original. */
export interface FeatureEntry {
  buildingId: string;
  businessId: string;
  modelId: string;
  recipe: 'colonial' | 'tecno' | 'boutique';
  category: Business['category'];
  /** Metros locales de la referencia: x = este, z = norte. */
  x: number;
  z: number;
  /** Rotación de la referencia (grados horarios desde el norte). */
  heading: number;
  params: ModelParams;
  color: string;
  buildingDescription: string;
  buildingDescriptionPt: string;
  profile: WorldBusinessProfile;
}

/** Conversión metros locales → coordenadas geográficas, anclada en Plaza Bolívar. */
export function localToWorld(x: number, z: number): LngLat {
  const k = metersPerDegree(WORLD_ORIGIN.lat);
  return { lng: WORLD_ORIGIN.lng + x / k.x, lat: WORLD_ORIGIN.lat + z / k.y };
}

/** Valores exactos de `negocios.json` de tumeremo-3d (los tres primeros establecimientos). */
export const FEATURE_ENTRIES: FeatureEntry[] = [
  {
    buildingId: 'arepera-el-guayabo',
    businessId: 'biz_arepera-el-guayabo',
    modelId: 'mdl_world_guayabo',
    recipe: 'colonial',
    category: 'food',
    x: -21.2,
    z: 10.2,
    heading: 180,
    params: { width: 6, depth: 7, height: 5.5, wallColor: '#F6B74A', roofColor: '#B5532F', accentColor: '#1F8A70' },
    color: '#1F8A70',
    buildingDescription: 'Edificio colonial de una planta con pórtico de columnas, terraza y cubierta a cuatro aguas.',
    buildingDescriptionPt: 'Edifício colonial de um piso com pórtico de colunas, terraço e cobertura de quatro águas.',
    profile: {
      buildingId: 'arepera-el-guayabo',
      businessId: 'biz_arepera-el-guayabo',
      name: 'Arepera El Guayabo',
      sign: 'AREPERA EL GUAYABO',
      category: 'comida',
      categoryLabels: { es: 'Comida', 'pt-BR': 'Comida' },
      emoji: '🍽️',
      slogan: 'Arepas recién hechas desde el amanecer',
      description:
        'Arepas asadas en budare con rellenos criollos: reina pepiada, pabellón, dominó y queso de mano. Jugos naturales de frutas de temporada y café guayoyo.',
      address: 'Av. Principal, local 3 (ficticia)',
      hours: 'Lun – Sáb · 6:00 a.m. – 2:00 p.m.',
      rating: 4.7,
      tags: ['Desayunos', 'Para llevar', 'Comida criolla'],
      photos: [
        'https://images.pexels.com/photos/30005123/pexels-photo-30005123.jpeg?auto=compress&cs=tinysrgb&w=900',
        'https://images.pexels.com/photos/32924384/pexels-photo-32924384.jpeg?auto=compress&cs=tinysrgb&w=900',
        'https://images.pexels.com/photos/13191276/pexels-photo-13191276.jpeg?auto=compress&cs=tinysrgb&w=900',
      ],
      contact: {
        phone: '0288-000-0101',
        whatsapp: '+58 000 000 0101',
        instagram: '@arepera.demo',
        email: 'arepera@demo.tumeremo.com',
      },
      products: [],
      promotions: [],
      accent: '#1F8A70',
      facade: '#F6B74A',
      roof: '#B5532F',
    },
  },
  {
    buildingId: 'tecnoselva-celulares',
    businessId: 'biz_tecnoselva-celulares',
    modelId: 'mdl_world_tecnoselva',
    recipe: 'tecno',
    category: 'tech',
    x: -15,
    z: 10.2,
    heading: 180,
    params: { width: 6, depth: 7, height: 7.2, wallColor: '#E8EEF2', roofColor: '#5D6D7E', accentColor: '#00A6FB' },
    color: '#00A6FB',
    buildingDescription: 'Edificio de dos plantas con escaparate de vidrio, franjas LED y antena de comunicaciones.',
    buildingDescriptionPt: 'Edifício de dois pisos com vitrine de vidro, faixas de LED e antena de comunicação.',
    profile: {
      buildingId: 'tecnoselva-celulares',
      businessId: 'biz_tecnoselva-celulares',
      name: 'TecnoSelva Celulares',
      sign: 'TECNOSELVA',
      category: 'tecnologia',
      categoryLabels: { es: 'Tecnología', 'pt-BR': 'Tecnologia' },
      emoji: '💻',
      slogan: 'Tu teléfono, siempre conectado',
      description:
        'Venta de teléfonos, accesorios, cargadores solares y planes de datos. Servicio técnico express para pantallas y baterías.',
      address: 'Av. Principal, local 5 (ficticia)',
      hours: 'Lun – Sáb · 8:30 a.m. – 6:30 p.m.',
      rating: 4.4,
      tags: ['Celulares', 'Accesorios', 'Servicio técnico'],
      photos: [
        'https://images.pexels.com/photos/31862950/pexels-photo-31862950.jpeg?auto=compress&cs=tinysrgb&w=900',
        'https://images.pexels.com/photos/14534828/pexels-photo-14534828.jpeg?auto=compress&cs=tinysrgb&w=900',
        'https://images.pexels.com/photos/6755075/pexels-photo-6755075.jpeg?auto=compress&cs=tinysrgb&w=900',
      ],
      contact: {
        phone: '0288-000-0102',
        whatsapp: '+58 000 000 0102',
        instagram: '@tecnoselva.demo',
        email: 'ventas@demo.tumeremo.com',
      },
      products: [],
      promotions: [],
      accent: '#00A6FB',
      facade: '#E8EEF2',
      roof: '#5D6D7E',
    },
  },
  {
    buildingId: 'boutique-orquidea',
    businessId: 'biz_boutique-orquidea',
    modelId: 'mdl_world_orquidea',
    recipe: 'boutique',
    category: 'fashion',
    x: -8.8,
    z: 10.2,
    heading: 180,
    params: { width: 5.8, depth: 7, height: 6.8, wallColor: '#F2A7C3', roofColor: '#7B3F61', accentColor: '#8E3B8A' },
    color: '#8E3B8A',
    buildingDescription: 'Edificio de dos plantas con escaparates, toldo a rayas, balcón y depósito de agua.',
    buildingDescriptionPt: 'Edifício de dois pisos com vitrines, toldo listrado, varanda e depósito de água.',
    profile: {
      buildingId: 'boutique-orquidea',
      businessId: 'biz_boutique-orquidea',
      name: 'Boutique Orquídea',
      sign: 'BOUTIQUE ORQUÍDEA',
      category: 'ropa',
      categoryLabels: { es: 'Ropa', 'pt-BR': 'Roupas' },
      emoji: '👟',
      slogan: 'Moda fresca para el trópico',
      description:
        'Ropa femenina ligera, vestidos de lino, accesorios artesanales y bisutería. Asesoría de imagen sin costo los sábados.',
      address: 'Av. Principal con Calle 2, local 7 (ficticia)',
      hours: 'Lun – Sáb · 9:00 a.m. – 7:00 p.m.',
      rating: 4.8,
      tags: ['Damas', 'Accesorios', 'Lino'],
      photos: [
        'https://images.pexels.com/photos/5531542/pexels-photo-5531542.jpeg?auto=compress&cs=tinysrgb&w=900',
        'https://images.pexels.com/photos/5698862/pexels-photo-5698862.jpeg?auto=compress&cs=tinysrgb&w=900',
        'https://images.pexels.com/photos/5698847/pexels-photo-5698847.jpeg?auto=compress&cs=tinysrgb&w=900',
      ],
      contact: {
        phone: '0288-000-0103',
        whatsapp: '+58 000 000 0103',
        instagram: '@orquidea.demo',
        email: 'orquidea@demo.tumeremo.com',
      },
      products: [],
      promotions: [],
      accent: '#8E3B8A',
      facade: '#F2A7C3',
      roof: '#7B3F61',
    },
  },
];

/** Definiciones para `MODEL_LIBRARY`: disponibles antes de validar cualquier documento. */
export const FEATURE_MODEL_DEFS: ModelDef[] = FEATURE_ENTRIES.map((f) => ({
  id: f.modelId,
  name: f.profile.name,
  category: 'building',
  description: f.buildingDescription,
  i18n: { 'pt-BR': { description: f.buildingDescriptionPt } },
  source: { type: 'procedural', recipe: f.recipe },
  defaults: { ...f.params },
  limits: { width: [4, 14], depth: [4, 14], height: [2.6, 16] },
  hasSign: true,
}));

/** Definición canónica de los edificios incorporados al documento compartido. */
export const FEATURE_BUILDINGS: CustomBuilding[] = FEATURE_ENTRIES.map((f) => ({
  id: f.buildingId,
  kind: 'building',
  name: f.profile.name,
  modelId: f.modelId,
  placement: { position: localToWorld(f.x, f.z), heading: f.heading, scale: 1 },
  params: { ...f.params },
  description: f.buildingDescription,
  i18n: { 'pt-BR': { description: f.buildingDescriptionPt } },
  placeId: null,
  visible: true,
  origin: 'demo',
}));

/** Definición canónica de los negocios, vinculados a su edificio por el ID estable. */
export const FEATURE_BUSINESSES: Business[] = FEATURE_ENTRIES.map((f) => ({
  id: f.businessId,
  name: f.profile.name,
  category: f.category,
  description: f.buildingDescription,
  i18n: { 'pt-BR': { description: f.buildingDescriptionPt } },
  hours: '',
  phone: '',
  whatsapp: '',
  instagram: '',
  color: f.color,
  buildingId: f.buildingId,
  published: true,
  origin: 'demo',
}));

/** IDs estables de los tres edificios (selección, cámara y ficha única en WORLD). */
export const FEATURE_BUILDING_IDS = new Set(FEATURE_ENTRIES.map((f) => f.buildingId));

/** Perfiles originales, con fotografías y datos no editables del STUDIO. */
export const FEATURE_PROFILES: WorldBusinessProfile[] = FEATURE_ENTRIES.map((f) => f.profile);

const PROFILE_BY_BUILDING = new Map(FEATURE_PROFILES.map((profile) => [profile.buildingId, profile]));

/** Perfil comercial completo asociado a un edificio de los tres ejemplos oficiales. */
export function getWorldBusinessProfile(buildingId: string): WorldBusinessProfile | undefined {
  return PROFILE_BY_BUILDING.get(buildingId);
}

const PROFILE_BY_BUSINESS = new Map(FEATURE_PROFILES.map((profile) => [profile.businessId, profile]));
const CANONICAL_BUSINESS_BY_ID = new Map(FEATURE_BUSINESSES.map((b) => [b.id, b]));

/**
 * Texto editable: gana la edición de STUDIO en el idioma activo. Solo se recurre al
 * perfil original cuando el campo está vacío o conserva el valor de la semilla, de modo
 * que los datos de demostración siguen visibles sin sobrescribir ninguna edición.
 */
function displayedText(
  business: Business,
  field: 'name' | 'description' | 'hours',
  lang: Lang,
  canonical: Business | undefined,
  fallback: string,
): string {
  const own = business.i18n?.[lang]?.[field];
  if (typeof own === 'string') {
    // STUDIO escribió esta variante (incluso vacía): se respeta; solo se sustituye
    // cuando conserva literalmente el texto de la semilla en portugués.
    if (own !== canonical?.i18n?.[lang]?.[field]) return own;
    return fallback;
  }
  const value = business[field];
  const seedValues = canonical ? [canonical[field], canonical.i18n?.['pt-BR']?.[field]] : [];
  return typeof value === 'string' && value.trim() && !seedValues.includes(value) ? value : fallback;
}

/** Igual que `displayedText`, para campos sin variantes localizadas. */
function displayedValue(value: string | undefined, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

/**
 * Compone la ficha de WORLD a partir del `Business` del WorldDocument compartido:
 * campos editables desde el documento, datos complementarios desde el perfil original.
 * Devuelve `undefined` para negocios que no sean uno de los tres oficiales.
 */
export function composeWorldBusinessProfile(business: Business, lang: Lang): ComposedWorldBusinessProfile | undefined {
  const profile = PROFILE_BY_BUSINESS.get(business.id);
  if (!profile) return undefined;
  const canonical = CANONICAL_BUSINESS_BY_ID.get(business.id);
  return {
    ...profile,
    name: displayedText(business, 'name', lang, canonical, profile.name),
    description: displayedText(business, 'description', lang, canonical, profile.description),
    hours: displayedText(business, 'hours', lang, canonical, profile.hours),
    contact: {
      ...profile.contact,
      phone: displayedValue(business.phone, profile.contact.phone),
      whatsapp: displayedValue(business.whatsapp, profile.contact.whatsapp),
      instagram: displayedValue(business.instagram, profile.contact.instagram),
    },
    accent: displayedValue(business.color, profile.accent),
    categoryLabels: {
      es: businessCategoryLabel(business.category, 'es'),
      'pt-BR': businessCategoryLabel(business.category, 'pt-BR'),
    },
    originalCategory: profile.category,
  };
}
