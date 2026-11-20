/**
 * GEOGRAFIA REAL — apenas referência e configuração da fonte.
 * Nada aqui é desenhado manualmente: ruas, quadras, água e edifícios do OSM vêm das tiles vetoriais.
 *
 * Fonte: OpenFreeMap (tiles vetoriais gratuitas, sem chave de API, esquema OpenMapTiles)
 * com dados do OpenStreetMap (© contribuidores do OpenStreetMap, ODbL).
 *
 * Por que não tile.openstreetmap.org? A política de uso das tiles raster do OSM desencoraja
 * aplicações com uso intensivo e não permite estilizar; as tiles vetoriais permitem estilo
 * próprio, extrusão 3D e rotação/pitch sem desfoque, sem expor nenhuma chave privada.
 */
import type { LngLat } from '../core/types';
import { getLang } from '../i18n/language';
import { translate } from '../i18n/translate';
import type { Lang } from '../i18n/types';

export const GEO_SOURCE = {
  id: 'osm-vector',
  tilejson: 'https://tiles.openfreemap.org/planet',
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  attribution:
    '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
    '© <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> ' +
    'Dados © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">contribuidores do OpenStreetMap</a>',
} as const;

/**
 * Localização verificável de Tumeremo:
 *  - Nominatim (OSM): "Tumeremo, Parroquia Tumeremo, Municipio Sifontes, Bolívar, Venezuela" (place=city).
 *  - Camada `place` das tiles: "Tumeremo" (city) em ≈ 7.29904°N, 61.50442°W.
 * O ponto de origem do mundo é a Plaza Bolívar (ponto `poi` do OSM, subclass=park).
 */
export const WORLD_ORIGIN: LngLat = { lng: -61.504973, lat: 7.30127 };

/** Estado da cobertura medida (tiles z14, 20 tiles ≈ 12 × 10 km ao redor da cidade). */
export function coverageNotes(lang: Lang = getLang()) {
  return {
    roads: translate('coverage.roads', lang),
    pois: translate('coverage.pois', lang),
    buildings: translate('coverage.buildings', lang),
  };
}
