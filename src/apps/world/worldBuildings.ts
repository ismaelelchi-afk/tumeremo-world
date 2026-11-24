/**
 * Adaptador WORLD de los tres comercios oficiales.
 *
 * Los edificios y negocios ya viven en el WorldDocument compartido (FASE B), así que
 * WORLD no aumenta ni duplica entidades: usa el documento del store directamente.
 * Los modelos y datos canónicos están en `src/data/featureBusinesses.ts`.
 */

/** IDs estables usados por WORLD para ficha única, exclusión de tarjeta y encuadre. */
export { FEATURE_BUILDING_IDS } from '../../data/featureBusinesses';
