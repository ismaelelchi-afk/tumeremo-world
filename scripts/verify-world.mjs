#!/usr/bin/env node
/**
 * Verificación de `data/world.public.json` y de los bundles generados.
 *
 * El export del navegador es la ÚNICA fuente de datos: este script no crea,
 * rellena ni reemplaza ningún archivo de datos. Solo lee y valida.
 *
 * Uso:
 *   node scripts/verify-world.mjs
 *   node scripts/verify-world.mjs --export <ruta-export.json>
 *   node scripts/verify-world.mjs --bundle dist-public/index.html
 *   node scripts/verify-world.mjs --export <ruta-export.json> --bundle dist-public/index.html
 *
 * Códigos de salida:
 *   0 = todo correcto;
 *   1 = datos o bundle inválidos / discrepancia con el export (o error de uso);
 *   2 = BLOQUEADO: falta data/world.public.json (no hay export del navegador).
 */

import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGlbBuffer } from './glb-integrity.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
export const WORLD_PATH = path.join(ROOT, 'data', 'world.public.json');

/**
 * Cadenas de CÓDIGO/PERSISTENCIA/RUTA PRIVADA que NO deben aparecer en el HTML público.
 * Las claves de traducción (`studio.*`) no se usan como marcador: forman parte de los
 * catálogos i18n compartidos y no habilitan ninguna función de edición.
 */
export const EDITOR_MARKERS = Object.freeze([
  '/studio.html',
  '/__local-world/update',
  'StudioApp',
  'documentStore',
  'initCustomModels',
  'importDocumentJson',
  'saveNow',
  'readwrite',
  'tumeremo-world:document:v1',
  'glb-models',
  'setItem(',
]);

/** Cadenas adicionales que SOLO se usan para confirmar que el bundle privado sí es STUDIO. */
const STUDIO_ONLY_MARKERS = Object.freeze(['TUMEREMO STUDIO', 'studio.menuExport']);
const ALL_MARKERS = Object.freeze([...new Set([...EDITOR_MARKERS, ...STUDIO_ONLY_MARKERS])]);
const STUDIO_PRESENCE_MARKERS = Object.freeze([
  'TUMEREMO STUDIO',
  'studio.menuExport',
  '/__local-world/update',
  '/studio.html',
  'setItem(',
  'tumeremo-world:document:v1',
]);
const COLLECTIONS = ['buildings', 'objects', 'businesses', 'places'];
const COUNT_KEYS = [...COLLECTIONS, 'models'];
const HASH64 = /^[0-9a-f]{64}$/i;
const HASH16 = /^[0-9a-f]{16}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_REPORTED = 40;

const USAGE = [
  'Uso:',
  '  node scripts/verify-world.mjs',
  '  node scripts/verify-world.mjs --export <ruta-export.json>',
  '  node scripts/verify-world.mjs --bundle dist-public/index.html',
  '  node scripts/verify-world.mjs --export <ruta-export.json> --bundle dist-public/index.html',
  '',
  'Sin opciones verifica el estado actual. Las opciones se pueden combinar.',
].join('\n');

const BLOCKED_MESSAGE = [
  'BLOQUEADO: no existe data/world.public.json.',
  'No se van a inventar datos ni a crear ese archivo desde semillas o fixtures.',
  '',
  'Para desbloquearlo, exporta desde STUDIO en el MISMO origen del servidor de desarrollo:',
  '  1. Abre http://localhost:5175 (npm run dev) y entra en STUDIO.',
  '  2. Menú → "Exportar JSON" (guarda el JSON resultante, p. ej. tumeremo-world-YYYYMMDD-HHMM.json).',
  '  3. Ejecuta:  npm run prepare:world -- <archivo-exportado.json>',
  '  4. Vuelve a ejecutar:  npm run verify:world',
  '',
  'Salida: código 2 (bloqueo de datos; no es un error de sintaxis).',
].join('\n');

/* --------------------------------------------------------------- utilidades */

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function display(value) {
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (text === undefined) text = String(value);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

/** Cuenta apariciones literales (no regex) para evitar falsos positivos por minificación. */
export function countOccurrences(text, needle) {
  if (typeof needle !== 'string' || needle.length === 0) return 0;
  const source = String(text ?? '');
  let count = 0;
  let index = 0;
  while ((index = source.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
  }
  return count;
}

export function scanEditorMarkers(text) {
  return ALL_MARKERS.map((marker) => ({ marker, count: countOccurrences(text, marker) }));
}

export function editorMarkerErrors(markers) {
  return markers
    .filter(({ marker, count }) => EDITOR_MARKERS.includes(marker) && count > 0)
    .map(({ marker, count }) => `Marcador de editor ${JSON.stringify(marker)}: ${count} aparición(es).`);
}

export function studioMarkerHits(markers) {
  return markers.filter(({ marker, count }) => STUDIO_PRESENCE_MARKERS.includes(marker) && count > 0);
}

export function printEditorMarkers(markers) {
  console.log('  Marcadores de editor (0 permitidos en el bundle público):');
  for (const { marker, count } of markers) {
    if (!EDITOR_MARKERS.includes(marker)) continue;
    console.log(`    - ${JSON.stringify(marker)}: ${count}`);
  }
}

function printProblems(errors, heading = 'Problemas') {
  if (!errors.length) return;
  console.error(`  ${heading} (${errors.length}):`);
  for (const error of errors.slice(0, MAX_REPORTED)) console.error(`    - ${error}`);
  if (errors.length > MAX_REPORTED) console.error(`    - ... y ${errors.length - MAX_REPORTED} más.`);
}

function printWarnings(warnings) {
  if (!warnings.length) return;
  console.log(`  Advertencias (${warnings.length}):`);
  for (const warning of warnings) console.log(`    - ${warning}`);
}

async function readBytes(filePath, label) {
  try {
    return await readFile(filePath);
  } catch (error) {
    throw new Error(`No se pudo leer ${label} "${filePath}": ${error.message}`);
  }
}

function parseJson(bytes, label) {
  let text = bytes.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} no es JSON válido: ${error.message}`);
  }
}

/** Serialización estable para comparar/firmar documentos sin depender del orden de claves. */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  const json = JSON.stringify(value);
  return json === undefined ? 'null' : json;
}

function canonicalSha(value) {
  return sha256(Buffer.from(stableStringify(value), 'utf8'));
}

/** Diferencias profundas: arrays ordenados, objetos por clave (el orden de claves no importa). */
function collectDiffs(expected, actual, trail, out = []) {
  if (out.length >= MAX_REPORTED) return out;

  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      out.push({ path: trail, expected, actual });
      return out;
    }
    if (expected.length !== actual.length) {
      out.push({ path: `${trail}.length`, expected: expected.length, actual: actual.length });
    }
    for (let index = 0; index < Math.min(expected.length, actual.length); index += 1) {
      collectDiffs(expected[index], actual[index], `${trail}[${index}]`, out);
    }
    return out;
  }

  if (isObject(expected) || isObject(actual)) {
    if (!isObject(expected) || !isObject(actual)) {
      out.push({ path: trail, expected, actual });
      return out;
    }
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    for (const key of keys) {
      if (!hasOwn(expected, key)) {
        out.push({ path: `${trail}.${key}`, expected: '<ausente>', actual: actual[key] });
      } else if (!hasOwn(actual, key)) {
        out.push({ path: `${trail}.${key}`, expected: expected[key], actual: '<ausente>' });
      } else {
        collectDiffs(expected[key], actual[key], `${trail}.${key}`, out);
      }
    }
    return out;
  }

  if (expected !== actual) out.push({ path: trail, expected, actual });
  return out;
}

function decodeGlb(glb, label, errors) {
  if (typeof glb !== 'string' || !glb.trim()) {
    errors.push(`${label} debe ser una cadena base64 no vacía.`);
    return null;
  }
  const normalized = glb.replace(/\s+/g, '');
  if (normalized.length % 4 !== 0 || !BASE64.test(normalized)) {
    errors.push(`${label} no es base64 válido.`);
    return null;
  }
  const decoded = Buffer.from(normalized, 'base64');
  if (decoded.toString('base64') !== normalized) {
    errors.push(`${label} no es base64 canónico.`);
    return null;
  }
  if (decoded.length === 0) {
    errors.push(`${label} decodifica a cero bytes.`);
    return null;
  }
  return decoded;
}

/* -------------------------------------------------------------- CLI / datos */

function parseArgs(argv) {
  const options = { help: false, exportPath: null, bundlePath: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--export' || arg.startsWith('--export=')) {
      const value = arg === '--export' ? argv[++index] : arg.slice('--export='.length);
      if (!value || value.startsWith('-')) throw new Error(`Falta la ruta para --export.\n${USAGE}`);
      if (options.exportPath) throw new Error('--export solo se puede indicar una vez.');
      options.exportPath = value;
    } else if (arg === '--bundle' || arg.startsWith('--bundle=')) {
      const value = arg === '--bundle' ? argv[++index] : arg.slice('--bundle='.length);
      if (!value || value.startsWith('-')) throw new Error(`Falta la ruta para --bundle.\n${USAGE}`);
      if (options.bundlePath) throw new Error('--bundle solo se puede indicar una vez.');
      options.bundlePath = value;
    } else {
      throw new Error(`Argumento desconocido ${JSON.stringify(arg)}.\n${USAGE}`);
    }
  }
  return options;
}

function validateWorld(world) {
  const errors = [];
  const warnings = [];
  const info = { countsActual: {}, modelIdsUsed: [], models: [] };

  if (!isObject(world)) {
    errors.push('La raíz de world.public.json debe ser un objeto JSON.');
    return { errors, warnings, info };
  }

  if (world.schemaVersion !== 1) errors.push(`schemaVersion debe ser 1 (valor: ${display(world.schemaVersion)}).`);
  if (typeof world.generatedAt !== 'string' || !ISO_DATE.test(world.generatedAt)) {
    errors.push(`generatedAt debe ser una fecha ISO-8601 (valor: ${display(world.generatedAt)}).`);
  }

  const source = isObject(world.source) ? world.source : {};
  if (!isObject(world.source)) {
    errors.push('source debe ser un objeto con file y sha256.');
  } else {
    if (typeof source.file !== 'string' || !source.file.trim()) {
      errors.push(`source.file debe ser un nombre de archivo no vacío (valor: ${display(source.file)}).`);
    }
    if (!HASH64.test(typeof source.sha256 === 'string' ? source.sha256 : '')) {
      errors.push(`source.sha256 debe tener 64 hexadecimales (valor: ${display(source.sha256)}).`);
    }
  }

  if (!isObject(world.counts)) {
    errors.push('counts debe ser un objeto con buildings, objects, businesses, places y models.');
  } else {
    for (const key of COUNT_KEYS) {
      const value = world.counts[key];
      if (!Number.isSafeInteger(value) || value < 0) {
        errors.push(`counts.${key} debe ser un entero >= 0 (valor: ${display(value)}).`);
      }
    }
  }

  if (!Array.isArray(world.modelIds)) {
    errors.push('modelIds debe ser un array de IDs de modelo.');
  } else {
    const seen = new Set();
    world.modelIds.forEach((id, index) => {
      if (typeof id !== 'string' || !id.trim()) {
        errors.push(`modelIds[${index}] debe ser un string no vacío (valor: ${display(id)}).`);
        return;
      }
      if (seen.has(id)) errors.push(`modelIds contiene el ID duplicado ${JSON.stringify(id)}.`);
      seen.add(id);
    });
  }

  if (!Array.isArray(world.models)) errors.push('models debe ser un array de CustomModelBundle.');

  if (!isObject(world.document)) {
    errors.push('document debe ser un objeto WorldDocument.');
  } else {
    if (hasOwn(world.document, 'customModels')) {
      errors.push('document NO debe contener la clave customModels (solo debe estar en models).');
    }
    for (const collection of COLLECTIONS) {
      const array = world.document[collection];
      if (!Array.isArray(array)) {
        errors.push(`document.${collection} debe ser un array.`);
      } else {
        info.countsActual[collection] = array.length;
      }
    }
  }

  if (isObject(world.counts)) {
    for (const collection of COLLECTIONS) {
      if (hasOwn(info.countsActual, collection) && world.counts[collection] !== info.countsActual[collection]) {
        errors.push(
          `counts.${collection} declara ${display(world.counts[collection])} pero document.${collection} tiene ${info.countsActual[collection]} elementos.`,
        );
      }
    }
    if (Array.isArray(world.models) && world.counts.models !== world.models.length) {
      errors.push(`counts.models declara ${display(world.counts.models)} pero models tiene ${world.models.length} elementos.`);
    }
  }

  const used = new Set();
  if (isObject(world.document)) {
    for (const collection of ['buildings', 'objects']) {
      if (!Array.isArray(world.document[collection])) continue;
      for (const item of world.document[collection]) {
        if (isObject(item) && typeof item.modelId === 'string' && item.modelId.trim()) used.add(item.modelId);
      }
    }
  }
  info.modelIdsUsed = [...used].sort();
  if (Array.isArray(world.modelIds)) {
    if (JSON.stringify([...world.modelIds].sort()) !== JSON.stringify(info.modelIdsUsed)) {
      const missing = info.modelIdsUsed.filter((id) => !world.modelIds.includes(id));
      const extra = world.modelIds.filter((id) => !used.has(id));
      errors.push(
        `modelIds no coincide con los modelId usados en document (missing: ${missing.join(', ') || 'ninguno'}; extra: ${extra.join(', ') || 'ninguno'}).`,
      );
    }
  }

  if (Array.isArray(world.models)) {
    world.models.forEach((bundle, index) => {
      const label = `models[${index}]`;
      if (!isObject(bundle)) {
        errors.push(`${label} debe ser un objeto.`);
        return;
      }
      const id = typeof bundle.id === 'string' && bundle.id.trim() ? bundle.id : null;
      if (!id) errors.push(`${label}.id debe ser un string no vacío (valor: ${display(bundle.id)}).`);
      if (bundle.aliases !== undefined) {
        if (!Array.isArray(bundle.aliases) || bundle.aliases.some((alias) => typeof alias !== 'string' || !alias.trim())) {
          errors.push(`${label}.aliases debe ser un array de strings no vacíos.`);
        }
      }

      const decoded = decodeGlb(bundle.glb, `${label}.glb`, errors);
      if (!decoded) return;

      validateGlbBuffer(decoded, `${label}.glb`, errors);

      if (!Number.isSafeInteger(bundle.size) || bundle.size <= 0) {
        errors.push(`${label}.size debe ser un entero > 0 (valor: ${display(bundle.size)}).`);
      } else if (decoded.length !== bundle.size) {
        errors.push(`${label}.size declara ${bundle.size} bytes pero el GLB decodifica a ${decoded.length} bytes.`);
      }

      const calculated = sha256(decoded);
      const declaredHash = bundle.hash;
      if (declaredHash === undefined) {
        warnings.push(`${label}.hash ausente: no se puede comparar con SHA-256.`);
      } else if (typeof declaredHash === 'string' && HASH64.test(declaredHash.trim())) {
        if (declaredHash.trim().toLowerCase() !== calculated) {
          errors.push(`${label}.hash SHA-256 no coincide: declarado ${declaredHash.trim().toLowerCase()}, calculado ${calculated}.`);
        }
      } else if (typeof declaredHash === 'string' && HASH16.test(declaredHash.trim())) {
        warnings.push(`${label}.hash usa el fallback heredado de 16 hex (${declaredHash.trim()}); no es verificable con SHA-256.`);
      } else {
        errors.push(`${label}.hash debe tener 64 hexadecimales SHA-256 (o 16 del fallback heredado).`);
      }

      info.models.push({
        id: id ?? `(índice ${index})`,
        size: decoded.length,
        declaredSize: bundle.size,
        calculated,
        declaredHash: typeof declaredHash === 'string' ? declaredHash : null,
      });
    });
  }

  return { errors, warnings, info };
}

/* -------------------------------------------------------------- presentación */

function printWorldReport(world, info, fileBytes) {
  const source = isObject(world.source) ? world.source : {};
  const counts = isObject(world.counts) ? world.counts : {};
  const formatCounts = (values) => COUNT_KEYS.map((key) => `${key}=${display(values[key])}`).join(', ');

  console.log('RESUMEN · data/world.public.json');
  console.log(`  Archivo: ${WORLD_PATH}`);
  console.log(`  Tamaño: ${fileBytes.length} bytes`);
  console.log(`  SHA-256 del archivo: ${sha256(fileBytes)}`);
  console.log(`  schemaVersion: ${display(world.schemaVersion)}`);
  console.log(`  generatedAt: ${display(world.generatedAt)}`);
  console.log(`  source.file: ${display(source.file)}`);
  console.log(`  source.sha256: ${display(source.sha256)}`);
  console.log(`  Conteos declarados: ${formatCounts(counts)}`);
  console.log(`  Conteos reales:     ${formatCounts({ ...info.countsActual, models: Array.isArray(world.models) ? world.models.length : 'n/a' })}`);
  const declaredModelIds = Array.isArray(world.modelIds) ? world.modelIds.filter((id) => typeof id === 'string') : [];
  console.log(`  modelIds declarados (${Array.isArray(world.modelIds) ? world.modelIds.length : 'n/a'}): ${declaredModelIds.join(', ') || '(ninguno)'}`);
  console.log(`  modelIds usados (${info.modelIdsUsed.length}): ${info.modelIdsUsed.join(', ') || '(ninguno)'}`);
  console.log(`  SHA-256 canónico del document: ${isObject(world.document) ? canonicalSha(world.document) : '(no objeto)'}`);
  console.log(`  Modelos (${info.models.length} decodificables, ${Array.isArray(world.models) ? world.models.length : 'n/a'} declarados):`);
  if (!info.models.length) console.log('    - (ninguno)');
  for (const model of info.models) {
    console.log(
      `    - ${model.id}: size=${model.size} (declarado=${display(model.declaredSize)}) sha256=${model.calculated} (declarado=${display(model.declaredHash)})`,
    );
  }
}

/* ------------------------------------------------------------------- checks */

async function checkExport(exportPath, world) {
  console.log(`\nEXPORT · ${exportPath}`);
  const bytes = await readBytes(exportPath, 'el export de STUDIO');
  const exportSha = sha256(bytes);
  const original = parseJson(bytes, 'el export de STUDIO');
  const errors = [];

  console.log(`  SHA-256 del export: ${exportSha}`);
  if (!isObject(original)) {
    printProblems(['El export de STUDIO debe ser un objeto JSON.'], 'Problemas del export');
    return true;
  }

  const sourceSha = isObject(world.source) ? world.source.sha256 : undefined;
  if (typeof sourceSha === 'string') {
    if (sourceSha.toLowerCase() !== exportSha) {
      errors.push(`source.sha256 (${sourceSha}) no coincide con el SHA-256 del export (${exportSha}).`);
    } else {
      console.log(`  source.sha256 coincide: ${sourceSha} [OK]`);
    }
  } else {
    errors.push('No hay un source.sha256 válido en world.public.json para comparar con el export.');
  }

  if (original.schemaVersion !== 1) errors.push(`El export tiene schemaVersion ${display(original.schemaVersion)} (se esperaba 1).`);

  const exportCounts = {};
  for (const collection of COLLECTIONS) {
    if (!Array.isArray(original[collection])) {
      errors.push(`export.${collection} debe ser un array.`);
      exportCounts[collection] = '(inválido)';
    } else {
      exportCounts[collection] = original[collection].length;
    }
  }
  const customModels = original.customModels;
  if (customModels === undefined) exportCounts.models = 0;
  else if (Array.isArray(customModels)) exportCounts.models = customModels.length;
  else {
    errors.push('export.customModels debe ser un array cuando está presente.');
    exportCounts.models = '(inválido)';
  }

  const worldCounts = isObject(world.counts) ? world.counts : {};
  console.log(`  Conteos export:    ${COUNT_KEYS.map((key) => `${key}=${display(exportCounts[key])}`).join(', ')}`);
  console.log(`  Conteos publicados: ${COUNT_KEYS.map((key) => `${key}=${display(worldCounts[key])}`).join(', ')}`);
  for (const key of COUNT_KEYS) {
    if (exportCounts[key] !== '(inválido)' && worldCounts[key] !== exportCounts[key]) {
      errors.push(`counts.${key}: export=${exportCounts[key]}, publicado=${display(worldCounts[key])}.`);
    }
  }

  // El document publicado debe ser exactamente el export sin customModels.
  const expectedDocument = { ...original };
  delete expectedDocument.customModels;
  const actualDocument = isObject(world.document) ? world.document : null;
  console.log(`  document SHA-256 canónico: export=${canonicalSha(expectedDocument)} publicado=${actualDocument ? canonicalSha(actualDocument) : '(no objeto)'}`);
  const documentDiffs = collectDiffs(expectedDocument, actualDocument, 'document');
  for (const diff of documentDiffs) {
    errors.push(`document: ${diff.path} -> export=${display(diff.expected)}, publicado=${display(diff.actual)}.`);
  }
  if (!documentDiffs.length) console.log('  document: deep equality [OK] (IDs, posiciones y flags incluidos)');

  const expectedModels = Array.isArray(customModels) ? customModels : [];
  const actualModels = Array.isArray(world.models) ? world.models : null;
  const modelDiffs = collectDiffs(expectedModels, actualModels, 'models');
  for (const diff of modelDiffs) {
    errors.push(`models: ${diff.path} -> export=${display(diff.expected)}, publicado=${display(diff.actual)}.`);
  }
  if (!modelDiffs.length) console.log(`  models: deep equality [OK] (${expectedModels.length} bundles)`);

  const used = new Set();
  for (const collection of ['buildings', 'objects']) {
    if (!Array.isArray(original[collection])) continue;
    for (const item of original[collection]) {
      if (isObject(item) && typeof item.modelId === 'string' && item.modelId.trim()) used.add(item.modelId);
    }
  }
  const expectedModelIds = [...used].sort();
  const publicModelIds = Array.isArray(world.modelIds) ? world.modelIds : null;
  const modelIdDiffs = collectDiffs(expectedModelIds, publicModelIds, 'modelIds');
  for (const diff of modelIdDiffs) {
    errors.push(`modelIds: ${diff.path} -> export=${display(diff.expected)}, publicado=${display(diff.actual)}.`);
  }
  if (!modelIdDiffs.length) console.log(`  modelIds: coinciden [OK] (${expectedModelIds.length})`);

  printProblems(errors, 'Diferencias con el export');
  return errors.length > 0;
}

async function checkBundleHtml(bundlePath, world) {
  console.log(`\nBUNDLE · ${bundlePath}`);
  const bytes = await readBytes(bundlePath, 'el bundle');
  const html = bytes.toString('utf8');
  const errors = [];
  let failedStat = false;
  try {
    if (!statSync(bundlePath).isFile()) failedStat = true;
  } catch {
    failedStat = true;
  }
  if (failedStat) errors.push(`La ruta ${bundlePath} no es un archivo regular.`);
  console.log(`  Tamaño: ${bytes.length} bytes; SHA-256: ${sha256(bytes)}`);

  const modelIds = Array.isArray(world.modelIds)
    ? world.modelIds.filter((id) => typeof id === 'string' && id.trim())
    : [];
  if (!modelIds.length) {
    errors.push('world.public.json no contiene modelIds válidos; no se puede verificar el bundle.');
  } else {
    const missing = modelIds.filter((id) => !html.includes(id));
    console.log(`  IDs de modelo presentes: ${modelIds.length - missing.length}/${modelIds.length}`);
    if (missing.length) errors.push(`Faltan ${missing.length} IDs de modelo en el HTML: ${missing.join(', ')}.`);
  }

  const entityIds = { buildings: [], businesses: [], places: [] };
  if (isObject(world.document)) {
    for (const collection of Object.keys(entityIds)) {
      const array = world.document[collection];
      if (!Array.isArray(array)) continue;
      entityIds[collection] = array
        .filter((item) => isObject(item) && typeof item.id === 'string' && item.id.trim())
        .map((item) => item.id);
    }
  }
  let total = 0;
  let found = 0;
  for (const [collection, ids] of Object.entries(entityIds)) {
    const hits = ids.filter((id) => html.includes(id)).length;
    total += ids.length;
    found += hits;
    console.log(`  IDs de ${collection} presentes: ${hits}/${ids.length}`);
  }
  if (!total) {
    errors.push('world.document no contiene IDs de buildings/businesses/places para verificar.');
  } else if (found === 0) {
    errors.push('No aparece ningún ID de buildings/businesses/places en el HTML.');
  }

  const markers = scanEditorMarkers(html);
  printEditorMarkers(markers);
  errors.push(...editorMarkerErrors(markers));

  printProblems(errors, 'Problemas del bundle');
  return errors.length > 0;
}

/* --------------------------------------------------------------------- main */

async function main(options) {
  if (!existsSync(WORLD_PATH)) {
    console.log(BLOCKED_MESSAGE);
    process.exitCode = 2;
    return;
  }

  const worldBytes = await readBytes(WORLD_PATH, 'data/world.public.json');
  const world = parseJson(worldBytes, 'data/world.public.json');
  const { errors, warnings, info } = validateWorld(world);

  printWorldReport(world, info, worldBytes);
  printWarnings(warnings);
  printProblems(errors, 'Errores de estructura');
  let failed = errors.length > 0;

  if (options.exportPath) {
    const exportPath = path.resolve(process.cwd(), options.exportPath);
    failed = (await checkExport(exportPath, world)) || failed;
  }
  if (options.bundlePath) {
    const bundlePath = path.resolve(process.cwd(), options.bundlePath);
    failed = (await checkBundleHtml(bundlePath, world)) || failed;
  }

  if (failed) {
    console.error('\nFALLO: la verificación encontró problemas (código 1).');
    process.exitCode = 1;
  } else {
    console.log('\nOK: datos y bundles verificados (código 0).');
  }
}

const invokedDirectly = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) console.log(USAGE);
    else await main(options);
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
