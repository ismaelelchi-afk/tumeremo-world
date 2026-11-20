/**
 * Categorías e iconos: las claves son técnicas y NO se traducen; las etiquetas visibles se
 * resuelven desde los catálogos ES / PT-BR según el idioma activo.
 */
import { getLang } from '../i18n/language';
import { translate, type TranslationKey } from '../i18n/translate';
import type { Lang } from '../i18n/types';
import type { BusinessCategory, PlaceCategory, PlaceIcon } from './types';

const PLACE_CATEGORY_KEY: Record<PlaceCategory, TranslationKey> = {
  square: 'category.place.square',
  government: 'category.place.government',
  health: 'category.place.health',
  transport: 'category.place.transport',
  market: 'category.place.market',
  lodging: 'category.place.lodging',
  education: 'category.place.education',
  worship: 'category.place.worship',
  food: 'category.place.food',
  bank: 'category.place.bank',
  other: 'category.place.other',
};

export const placeCategoryLabel = (c: PlaceCategory, lang: Lang = getLang()) => translate(PLACE_CATEGORY_KEY[c], lang);
export const PLACE_CATEGORIES = Object.keys(PLACE_CATEGORY_KEY) as PlaceCategory[];

export const PLACE_ICONS: PlaceIcon[] = ['pin', 'building', 'store', 'tree', 'home', 'road', 'info', 'cube', 'map', 'clock'];

const PLACE_ICON_KEY: Record<PlaceIcon, TranslationKey> = {
  pin: 'icon.pin',
  building: 'icon.building',
  store: 'icon.store',
  tree: 'icon.tree',
  home: 'icon.home',
  road: 'icon.road',
  info: 'icon.info',
  cube: 'icon.cube',
  map: 'icon.map',
  clock: 'icon.clock',
};

export const placeIconLabel = (i: PlaceIcon, lang: Lang = getLang()) => translate(PLACE_ICON_KEY[i], lang);

/** Ícone inicial de cada categoria — não altera nenhum dado original. */
export const PLACE_ICON_BY_CATEGORY: Record<PlaceCategory, PlaceIcon> = {
  square: 'tree',
  government: 'building',
  health: 'info',
  transport: 'road',
  market: 'store',
  lodging: 'home',
  education: 'building',
  worship: 'home',
  food: 'store',
  bank: 'building',
  other: 'pin',
};

const BUSINESS_CATEGORY_KEY: Record<BusinessCategory, TranslationKey> = {
  food: 'category.business.food',
  cafe: 'category.business.cafe',
  grocery: 'category.business.grocery',
  services: 'category.business.services',
  health: 'category.business.health',
  lodging: 'category.business.lodging',
  fashion: 'category.business.fashion',
  tech: 'category.business.tech',
  crafts: 'category.business.crafts',
  other: 'category.business.other',
};

export const businessCategoryLabel = (c: BusinessCategory, lang: Lang = getLang()) => translate(BUSINESS_CATEGORY_KEY[c], lang);
export const BUSINESS_CATEGORIES = Object.keys(BUSINESS_CATEGORY_KEY) as BusinessCategory[];
