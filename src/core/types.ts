/**
 * CONTRATOS DE DADOS — compartilhados por WORLD e STUDIO.
 *
 * Camadas completamente separadas:
 *  1. Geografia real      -> NÃO vive aqui. Vem das tiles vetoriais do OpenStreetMap (ver geo/geography.ts).
 *  2. Lugares (info)      -> Place[]            (WorldDocument.places)       editável no STUDIO
 *  3. Modelos 3D          -> ModelDef[]         (data/models.ts)             biblioteca compartilhada
 *  4. Construções         -> CustomBuilding[]   (WorldDocument.buildings)    editável
 *  5. Objetos 3D          -> WorldObject3D[]    (WorldDocument.objects)      editável
 *  6. Comércios           -> Business[]         (WorldDocument.businesses)   editável
 *  7. Configuração visual -> VisualConfig       (data/visual.json)           somente leitura nesta versão
 *
 * 2, 4, 5 e 6 formam o WorldDocument, que é o que o STUDIO grava e o WORLD lê.
 * Nenhuma entidade personalizada altera a geografia original.
 *
 * Los campos `i18n` opcionales guardan variantes ES / PT-BR de los textos descriptivos.
 * El campo original sigue siendo la fuente de verdad y se usa como último recurso (fallback),
 * por lo que los documentos antiguos y las importaciones sin traducciones siguen siendo válidos.
 */
import type { HasLocalizedTexts } from '../i18n/types';

/** Identificador único com prefixo de tipo: `bld_x8k2m9qa`, `biz_…`, `obj_…`, `plc_…`, `mdl_…`. */
export type Id = string;

export interface LngLat {
  lng: number;
  lat: number;
}

/** Posição no mundo. `heading` = direção da fachada frontal, em graus no sentido horário a partir do norte. */
export interface Placement {
  position: LngLat;
  heading: number;
  /** Multiplicador uniforme aplicado sobre as dimensões do modelo. */
  scale: number;
}

/** Parâmetros editáveis de um modelo (metros e cores CSS). */
export interface ModelParams {
  width: number;
  depth: number;
  height: number;
  wallColor: string;
  roofColor: string;
  accentColor: string;
}

export type ModelCategory = 'building' | 'object';

export type ProceduralRecipe =
  | 'house-zinc'
  | 'shop-awning'
  | 'bodega'
  | 'two-story'
  | 'midrise'
  | 'warehouse'
  | 'pavilion'
  | 'signal-tower'
  | 'chapel'
  | 'moriche-palm'
  | 'tree'
  | 'street-lamp'
  | 'totem';

/** Origem da geometria de um modelo. `glb` carrega um arquivo glTF binário via GLTFLoader. */
export type ModelSource =
  | { type: 'procedural'; recipe: ProceduralRecipe }
  | { type: 'glb'; url: string };

export interface ModelDef extends HasLocalizedTexts {
  id: Id;
  name: string;
  category: ModelCategory;
  description: string;
  source: ModelSource;
  defaults: ModelParams;
  /** Faixas permitidas no editor: [mín, máx] em metros. */
  limits: { width: [number, number]; depth: [number, number]; height: [number, number] };
  /** Se o modelo exibe um letreiro com o nome. */
  hasSign?: boolean;
}

export type Origin = 'demo' | 'studio';

export interface CustomBuilding extends HasLocalizedTexts {
  id: Id;
  kind: 'building';
  name: string;
  modelId: Id;
  placement: Placement;
  params: ModelParams;
  description: string;
  /** Referência opcional a um Place (lugar real de referência). */
  placeId: Id | null;
  visible: boolean;
  origin: Origin;
}

export interface WorldObject3D extends HasLocalizedTexts {
  id: Id;
  kind: 'object';
  name: string;
  modelId: Id;
  placement: Placement;
  params: ModelParams;
  visible: boolean;
  origin: Origin;
}

export type BusinessCategory =
  | 'food'
  | 'cafe'
  | 'grocery'
  | 'services'
  | 'health'
  | 'lodging'
  | 'fashion'
  | 'tech'
  | 'crafts'
  | 'other';

export interface Business extends HasLocalizedTexts {
  id: Id;
  name: string;
  category: BusinessCategory;
  description: string;
  hours: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  color: string;
  /** Referência ao edifício (CustomBuilding.id). Única fonte da relação comércio ↔ edifício. */
  buildingId: Id | null;
  /** Comércios não publicados só aparecem no STUDIO. */
  published: boolean;
  origin: Origin;
}

export type PlaceCategory =
  | 'square'
  | 'government'
  | 'health'
  | 'transport'
  | 'market'
  | 'lodging'
  | 'education'
  | 'worship'
  | 'food'
  | 'bank'
  | 'other';

/** Ícones disponíveis para um lugar (todos existem em `ui/Icon.tsx`). */
export type PlaceIcon = 'pin' | 'building' | 'store' | 'tree' | 'home' | 'road' | 'info' | 'cube' | 'map' | 'clock';

export interface Place extends HasLocalizedTexts {
  id: Id;
  name: string;
  category: PlaceCategory;
  position: LngLat;
  description?: string;
  /** Rastreabilidade da informação original — preservada ao editar. */
  source: { type: 'osm'; layer: string; subclass: string } | { type: 'manual'; note: string };
  /** Visibilidade individual no mapa e na busca do WORLD. */
  visible: boolean;
  /** Ícone escolhido no STUDIO. Ausente = ícone padrão da categoria. */
  icon?: PlaceIcon;
}

/** Selecionável no WORLD. */
export type WorldSelection =
  | { kind: 'place'; id: Id }
  | { kind: 'building'; id: Id }
  | { kind: 'business'; id: Id };

/** Entidade 3D editável no STUDIO. */
export interface EntityRef {
  kind: 'building' | 'object';
  id: Id;
}

export type Entity3D = CustomBuilding | WorldObject3D;

/** Documento mutável (a "camada personalizada"). É o que o STUDIO grava e o WORLD lê. */
export interface WorldDocument {
  schemaVersion: 1;
  updatedAt: string;
  buildings: CustomBuilding[];
  objects: WorldObject3D[];
  businesses: Business[];
  /** Opcional: documentos antigos não tinham lugares; a seed restaura os 14 originais. */
  places?: Place[];
}

export interface ThemePalette {
  label: string;
  background: string;
  land: string;
  residential: string;
  park: string;
  wood: string;
  water: string;
  roadMinor: string;
  roadMinorCasing: string;
  roadService: string;
  roadTrunk: string;
  roadTrunkCasing: string;
  track: string;
  path: string;
  building: string;
  text: string;
  halo: string;
  sky: string;
  horizon: string;
  fog: string;
  ambient: string;
  ambientIntensity: number;
  sun: string;
  sunIntensity: number;
  /** 0..1: brilho de janelas/neon. */
  glow: number;
  ui: 'dark' | 'light';
}

export interface CameraView {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface VisualConfig {
  defaultTheme: string;
  themes: Record<string, ThemePalette>;
  home: CameraView;
  bounds: [[number, number], [number, number]];
  minZoom: number;
  maxZoom: number;
  pitch3d: number;
  /** Cores por categoria de lugar. */
  placeColors: Record<PlaceCategory, string>;
}
