import { useSyncExternalStore } from 'react';
import type { ModelDef, ModelParams } from '../core/types';

const p = (
  width: number,
  depth: number,
  height: number,
  wallColor: string,
  roofColor: string,
  accentColor: string,
): ModelParams => ({ width, depth, height, wallColor, roofColor, accentColor });

/** Biblioteca inicial compartilhada por WORLD e STUDIO. As receitas são procedurais (engine/models). */
export const MODEL_LIBRARY: ModelDef[] = [
  {
    id: 'mdl_house-zinc',
    name: 'Casa de zinco',
    category: 'building',
    description: 'Casa de bloco com telhado de zinco de duas águas e varanda.',
    i18n: { es: { name: 'Casa de zinc', description: 'Casa de bloque con techo de zinc a dos aguas y porche.' } },
    source: { type: 'procedural', recipe: 'house-zinc' },
    defaults: p(9, 8, 3.2, '#e9c9a0', '#8a96a0', '#2f8f9d'),
    limits: { width: [5, 20], depth: [5, 20], height: [2.6, 5] },
  },
  {
    id: 'mdl_shop-awning',
    name: 'Comércio com toldo',
    category: 'building',
    description: 'Loja de rua com vitrine, toldo listrado e letreiro.',
    i18n: { es: { name: 'Comercio con toldo', description: 'Tienda de calle con escaparate, toldo a rayas y letrero.' } },
    source: { type: 'procedural', recipe: 'shop-awning' },
    defaults: p(10, 9, 4.2, '#f1e3c8', '#44505a', '#e8b04a'),
    limits: { width: [6, 24], depth: [6, 20], height: [3.4, 8] },
    hasSign: true,
  },
  {
    id: 'mdl_bodega',
    name: 'Bodega de esquina',
    category: 'building',
    description: 'Bodega pequena com cobertura inclinada, portão de enrolar e letreiro.',
    i18n: { es: { name: 'Bodega de esquina', description: 'Bodega pequeña con cubierta inclinada, persiana metálica y letrero.' } },
    source: { type: 'procedural', recipe: 'bodega' },
    defaults: p(7, 7, 3.6, '#9fd3c7', '#667580', '#f2a541'),
    limits: { width: [4, 14], depth: [4, 14], height: [3, 5] },
    hasSign: true,
  },
  {
    id: 'mdl_two-story',
    name: 'Sobrado',
    category: 'building',
    description: 'Sobrado de dois pisos com sacada e caixa d’água.',
    i18n: { es: { name: 'Casa de dos pisos', description: 'Casa de dos plantas con balcón y tanque de agua.' } },
    source: { type: 'procedural', recipe: 'two-story' },
    defaults: p(10, 9, 6.4, '#e8d9c4', '#a65b45', '#2aa6a1'),
    limits: { width: [6, 22], depth: [6, 20], height: [5.4, 10] },
  },
  {
    id: 'mdl_midrise',
    name: 'Edifício',
    category: 'building',
    description: 'Edifício de vários andares com fachada de janelas e coroa luminosa.',
    i18n: { es: { description: 'Edificio de varias plantas con fachada de ventanas y corona luminosa.' } },
    source: { type: 'procedural', recipe: 'midrise' },
    defaults: p(14, 12, 21, '#cdd5d9', '#4b5963', '#5eead4'),
    limits: { width: [8, 30], depth: [8, 30], height: [9, 60] },
  },
  {
    id: 'mdl_warehouse',
    name: 'Galpão',
    category: 'building',
    description: 'Galpão amplo com cobertura metálica e portão de carga.',
    i18n: { es: { name: 'Almacén', description: 'Almacén amplio con cubierta metálica y puerta de carga.' } },
    source: { type: 'procedural', recipe: 'warehouse' },
    defaults: p(20, 14, 6, '#b9c3c9', '#7b8b97', '#e8b34b'),
    limits: { width: [10, 50], depth: [8, 40], height: [4, 12] },
  },
  {
    id: 'mdl_pavilion',
    name: 'Pavilhão aberto',
    category: 'building',
    description: 'Cobertura sobre colunas, ideal para feiras e mercados.',
    i18n: { es: { name: 'Pabellón abierto', description: 'Cubierta sobre columnas, ideal para ferias y mercados.' } },
    source: { type: 'procedural', recipe: 'pavilion' },
    defaults: p(16, 12, 4.5, '#d8c3a0', '#c75d3a', '#e8b34b'),
    limits: { width: [8, 40], depth: [8, 30], height: [3.5, 8] },
  },
  {
    id: 'mdl_chapel',
    name: 'Capela',
    category: 'building',
    description: 'Capela simples com campanário e cruz.',
    i18n: { es: { description: 'Capilla sencilla con campanario y cruz.' } },
    source: { type: 'procedural', recipe: 'chapel' },
    defaults: p(8, 14, 5, '#f4efe6', '#9a5b3f', '#e8b34b'),
    limits: { width: [6, 16], depth: [8, 24], height: [4, 8] },
  },
  {
    id: 'mdl_signal-tower',
    name: 'Torre de sinal',
    category: 'building',
    description: 'Marco luminoso em treliça, visível de longe.',
    i18n: { es: { name: 'Torre de señal', description: 'Hito luminoso de celosía, visible desde lejos.' } },
    source: { type: 'procedural', recipe: 'signal-tower' },
    defaults: p(4, 4, 38, '#cfd8dc', '#90a4ae', '#5eead4'),
    limits: { width: [2, 10], depth: [2, 10], height: [12, 80] },
  },
  {
    id: 'mdl_moriche-palm',
    name: 'Palmeira moriche',
    category: 'object',
    description: 'Palmeira alta de copa aberta.',
    i18n: { es: { description: 'Palmera alta de copa abierta.' } },
    source: { type: 'procedural', recipe: 'moriche-palm' },
    defaults: p(4, 4, 9, '#7a5a3a', '#2f7d4a', '#c9b458'),
    limits: { width: [2, 8], depth: [2, 8], height: [4, 18] },
  },
  {
    id: 'mdl_tree',
    name: 'Árvore',
    category: 'object',
    description: 'Árvore de copa arredondada.',
    i18n: { es: { description: 'Árbol de copa redondeada.' } },
    source: { type: 'procedural', recipe: 'tree' },
    defaults: p(6, 6, 7, '#6b4a2f', '#3f8a4f', '#3f8a4f'),
    limits: { width: [2, 14], depth: [2, 14], height: [3, 16] },
  },
  {
    id: 'mdl_street-lamp',
    name: 'Poste de luz',
    category: 'object',
    description: 'Poste de iluminação pública que acende à noite.',
    i18n: { es: { description: 'Poste de alumbrado público que se enciende de noche.' } },
    source: { type: 'procedural', recipe: 'street-lamp' },
    defaults: p(1, 1, 6.5, '#2b3640', '#2b3640', '#ffd27a'),
    limits: { width: [0.6, 2], depth: [0.6, 2], height: [4, 12] },
  },
  {
    id: 'mdl_totem',
    name: 'Totem digital',
    category: 'object',
    description: 'Totem luminoso com o nome do ponto.',
    i18n: { es: { name: 'Tótem digital', description: 'Tótem luminoso con el nombre del punto.' } },
    source: { type: 'procedural', recipe: 'totem' },
    defaults: p(1.4, 0.5, 3.2, '#1b2730', '#1b2730', '#5eead4'),
    limits: { width: [0.8, 4], depth: [0.3, 1.5], height: [2, 8] },
    hasSign: true,
  },
];

const BY_ID = new Map(MODEL_LIBRARY.map((m) => [m.id, m]));

/**
 * Registro dinâmico de modelos importados. Os modelos originais continuam intactos em
 * MODEL_LIBRARY; aqui só entram GLBs locais e seus apelidos (usados ao importar JSON).
 */
const CUSTOM = new Map<string, ModelDef>();
const ALIASES = new Map<string, string>();
const listeners = new Set<() => void>();
let ALL: ModelDef[] = [...MODEL_LIBRARY];

function rebuildAll() {
  ALL = [...MODEL_LIBRARY, ...CUSTOM.values()];
}

function emit() {
  listeners.forEach((l) => l());
}

/** Busca primeiro nos originais, depois nos importados e, por fim, nos apelidos. */
export const getModel = (id: string): ModelDef | undefined => {
  const direct = BY_ID.get(id) ?? CUSTOM.get(id);
  if (direct) return direct;
  const canonical = ALIASES.get(id);
  return canonical ? CUSTOM.get(canonical) : undefined;
};

/** Lista estável para a biblioteca (original + importados). */
export const getModelLibrary = (): ModelDef[] => ALL;

export function subscribeModels(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useModelLibrary(): ModelDef[] {
  return useSyncExternalStore(subscribeModels, getModelLibrary, getModelLibrary);
}

export function registerModel(def: ModelDef, aliases: string[] = []) {
  if (BY_ID.has(def.id)) throw new Error(`ID de modelo reservado: ${def.id}`);
  CUSTOM.set(def.id, def);
  addModelAliases([...aliases, def.id], def.id);
  rebuildAll();
  emit();
}

export function addModelAliases(aliases: string[], canonicalId: string) {
  let changed = false;
  for (const alias of aliases) {
    if (!alias || alias === canonicalId || BY_ID.has(alias) || CUSTOM.has(alias)) continue;
    if (ALIASES.get(alias) !== canonicalId) {
      ALIASES.set(alias, canonicalId);
      changed = true;
    }
  }
  if (changed) emit();
}

export function unregisterModel(id: string) {
  if (!CUSTOM.delete(id)) return;
  for (const [alias, canonical] of ALIASES) if (canonical === id) ALIASES.delete(alias);
  rebuildAll();
  emit();
}
