/**
 * Compatibilidad de imports para la ficha comercial de WORLD.
 *
 * Los perfiles originales, sus fotografías y la composición con el `Business` del
 * documento compartido son canónicos en `src/data/featureBusinesses.ts`; aquí solo se
 * reexportan para no tocar la estructura de módulos de los consumidores existentes.
 */
export { FEATURE_PROFILES, getWorldBusinessProfile, composeWorldBusinessProfile } from '../../data/featureBusinesses';
export type {
  ComposedWorldBusinessProfile,
  WorldBusinessContact,
  WorldCatalogEntry,
  WorldBusinessProfile,
} from '../../data/featureBusinesses';
