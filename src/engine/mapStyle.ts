import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { GEO_SOURCE } from '../geo/geography';
import type { ThemePalette } from '../core/types';

/**
 * Estilo cartográfico próprio de TUMEREMO WORLD sobre as tiles vetoriais do OSM (esquema OpenMapTiles).
 * Tudo que depende do tema está em `paint`; `themePaintUpdates` reaplica só isso ao trocar Dia/Noite.
 */

const FONT = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];
const SRC = 'osm';

const w = (a: number, b: number) => ['interpolate', ['exponential', 2], ['zoom'], 12, a, 19, b] as never;

const ROAD_FILTER_LINE = ['==', ['geometry-type'], 'LineString'];

export const ROAD_FILL_LAYERS = [
  'road-path',
  'road-track',
  'road-service',
  'road-minor',
  'road-secondary',
  'road-trunk',
];

export function buildLayers(t: ThemePalette): LayerSpecification[] {
  return [
    { id: 'background', type: 'background', paint: { 'background-color': t.background } },
    {
      id: 'landcover-wood',
      type: 'fill',
      source: SRC,
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'wood'],
      paint: { 'fill-color': t.wood, 'fill-opacity': 0.85 },
    },
    {
      id: 'landcover-grass',
      type: 'fill',
      source: SRC,
      'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['grass', 'farmland']]],
      paint: { 'fill-color': t.park, 'fill-opacity': 0.7 },
    },
    {
      id: 'landuse-residential',
      type: 'fill',
      source: SRC,
      'source-layer': 'landuse',
      filter: ['in', ['get', 'class'], ['literal', ['residential', 'suburb', 'neighbourhood', 'commercial', 'retail']]],
      paint: { 'fill-color': t.residential, 'fill-opacity': 0.9 },
    },
    {
      id: 'landuse-green',
      type: 'fill',
      source: SRC,
      'source-layer': 'landuse',
      filter: ['in', ['get', 'class'], ['literal', ['park', 'pitch', 'playground', 'recreation_ground', 'cemetery', 'stadium']]],
      paint: { 'fill-color': t.park, 'fill-opacity': 0.9 },
    },
    {
      id: 'park',
      type: 'fill',
      source: SRC,
      'source-layer': 'park',
      paint: { 'fill-color': t.park, 'fill-opacity': 0.9 },
    },
    {
      id: 'water',
      type: 'fill',
      source: SRC,
      'source-layer': 'water',
      paint: { 'fill-color': t.water },
    },
    {
      id: 'waterway',
      type: 'line',
      source: SRC,
      'source-layer': 'waterway',
      paint: { 'line-color': t.water, 'line-width': w(0.6, 5) },
    },
    // ---- ruas (contorno + preenchimento) ----
    {
      id: 'road-casing',
      type: 'line',
      source: SRC,
      'source-layer': 'transportation',
      minzoom: 13,
      filter: ['all', ROAD_FILTER_LINE, ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway']]]] as never,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': t.roadMinorCasing,
        'line-width': [
          'interpolate',
          ['exponential', 2],
          ['zoom'],
          12,
          ['match', ['get', 'class'], ['trunk', 'primary', 'motorway'], 2.4, ['secondary', 'tertiary'], 1.6, 1.2],
          19,
          ['match', ['get', 'class'], ['trunk', 'primary', 'motorway'], 30, ['secondary', 'tertiary'], 22, 18],
        ] as never,
        'line-opacity': 0.9,
      },
    },
    {
      id: 'road-path',
      type: 'line',
      source: SRC,
      'source-layer': 'transportation',
      minzoom: 14.5,
      filter: ['all', ROAD_FILTER_LINE, ['in', ['get', 'class'], ['literal', ['path', 'pedestrian']]]] as never,
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': t.path, 'line-width': w(0.4, 2), 'line-dasharray': [1.2, 1.6] },
    },
    {
      id: 'road-track',
      type: 'line',
      source: SRC,
      'source-layer': 'transportation',
      minzoom: 13.5,
      filter: ['all', ROAD_FILTER_LINE, ['==', ['get', 'class'], 'track']] as never,
      paint: { 'line-color': t.track, 'line-width': w(0.5, 4), 'line-dasharray': [3, 1.6] },
    },
    {
      id: 'road-service',
      type: 'line',
      source: SRC,
      'source-layer': 'transportation',
      minzoom: 14,
      filter: ['all', ROAD_FILTER_LINE, ['==', ['get', 'class'], 'service']] as never,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': t.roadService, 'line-width': w(0.3, 9) },
    },
    {
      id: 'road-minor',
      type: 'line',
      source: SRC,
      'source-layer': 'transportation',
      minzoom: 12.5,
      filter: ['all', ROAD_FILTER_LINE, ['in', ['get', 'class'], ['literal', ['minor']]]] as never,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': t.roadMinor, 'line-width': w(0.5, 16) },
    },
    {
      id: 'road-secondary',
      type: 'line',
      source: SRC,
      'source-layer': 'transportation',
      minzoom: 12,
      filter: ['all', ROAD_FILTER_LINE, ['in', ['get', 'class'], ['literal', ['tertiary', 'secondary']]]] as never,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': t.roadMinor, 'line-width': w(1, 20) },
    },
    {
      id: 'road-trunk',
      type: 'line',
      source: SRC,
      'source-layer': 'transportation',
      minzoom: 8,
      filter: ['all', ROAD_FILTER_LINE, ['in', ['get', 'class'], ['literal', ['trunk', 'primary', 'motorway']]]] as never,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': t.roadTrunk, 'line-width': w(1.4, 28) },
    },
    // ---- edifícios mapeados no OSM (poucos em Tumeremo) ----
    {
      id: 'building-osm',
      type: 'fill-extrusion',
      source: SRC,
      'source-layer': 'building',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': t.building,
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 4] as never,
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0] as never,
        'fill-extrusion-opacity': 0.92,
      },
    },
    // ---- rótulos ----
    {
      id: 'road-label',
      type: 'symbol',
      source: SRC,
      'source-layer': 'transportation_name',
      minzoom: 15.2,
      layout: {
        'symbol-placement': 'line',
        'text-field': ['get', 'name'] as never,
        'text-font': FONT,
        'text-size': ['interpolate', ['linear'], ['zoom'], 15, 10, 19, 13] as never,
        'text-letter-spacing': 0.04,
      },
      paint: { 'text-color': t.text, 'text-halo-color': t.halo, 'text-halo-width': 1.6, 'text-opacity': 0.8 },
    },
    {
      id: 'water-label',
      type: 'symbol',
      source: SRC,
      'source-layer': 'water_name',
      layout: { 'text-field': ['get', 'name'] as never, 'text-font': ['Noto Sans Italic'], 'text-size': 12 },
      paint: { 'text-color': t.text, 'text-halo-color': t.halo, 'text-halo-width': 1.4, 'text-opacity': 0.7 },
    },
    {
      id: 'place-neighbourhood',
      type: 'symbol',
      source: SRC,
      'source-layer': 'place',
      minzoom: 14.6,
      maxzoom: 17.4,
      filter: ['in', ['get', 'class'], ['literal', ['suburb', 'neighbourhood', 'quarter']]] as never,
      layout: {
        'text-field': ['get', 'name'] as never,
        'text-font': FONT,
        'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10, 17, 13] as never,
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.14,
        'text-max-width': 7,
      },
      paint: { 'text-color': t.text, 'text-halo-color': t.halo, 'text-halo-width': 1.4, 'text-opacity': 0.5 },
    },
    {
      id: 'place-city',
      type: 'symbol',
      source: SRC,
      'source-layer': 'place',
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village']]] as never,
      layout: {
        'text-field': ['get', 'name'] as never,
        'text-font': FONT_BOLD,
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 14, 15, 20] as never,
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.22,
      },
      paint: { 'text-color': t.text, 'text-halo-color': t.halo, 'text-halo-width': 2, 'text-opacity': 0.92 },
    },
  ];
}

export function buildSky(t: ThemePalette) {
  return {
    'sky-color': t.sky,
    'horizon-color': t.horizon,
    'fog-color': t.fog,
    'sky-horizon-blend': 0.55,
    'horizon-fog-blend': 0.7,
    'fog-ground-blend': 0.6,
  };
}

export function buildStyle(t: ThemePalette): StyleSpecification {
  return {
    version: 8,
    name: 'tumeremo-world',
    glyphs: GEO_SOURCE.glyphs,
    sources: {
      [SRC]: { type: 'vector', url: GEO_SOURCE.tilejson, attribution: GEO_SOURCE.attribution },
    },
    sky: buildSky(t),
    layers: buildLayers(t),
  } as StyleSpecification;
}

/** Lista [camada, propriedade, valor] para reaplicar ao trocar o tema sem recarregar o estilo. */
export function themePaintUpdates(t: ThemePalette): Array<[string, string, unknown]> {
  const out: Array<[string, string, unknown]> = [];
  for (const l of buildLayers(t)) {
    const paint = (l as { paint?: Record<string, unknown> }).paint;
    if (!paint) continue;
    for (const [k, v] of Object.entries(paint)) out.push([l.id, k, v]);
  }
  return out;
}
