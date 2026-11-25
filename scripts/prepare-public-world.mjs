#!/usr/bin/env node
/**
 * Genera `data/world.public.json` a partir del JSON exportado por STUDIO
 * (`exportDocumentJson`, que incluye `customModels` con los GLB en base64).
 *
 * El export es la única fuente permitida: este script NUNCA lee `seed.json` ni
 * reconstruye entidades. Tampoco filtra por `published` / `visible`.
 *
 * Uso:
 *   node scripts/prepare-public-world.mjs <ruta-export.json>
 *   node scripts/prepare-public-world.mjs --force <ruta-export.json>
 *   node scripts/prepare-public-world.mjs --check <ruta-export.json>
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGlbBuffer } from './glb-integrity.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(HERE, '..', 'data');
const MODEL_IDS_PATH = path.join(DATA_DIR, 'model-ids.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'world.public.json');
const TMP_PATH = `${OUTPUT_PATH}.tmp`;

const USAGE = [
  'Uso:',
  '  node scripts/prepare-public-world.mjs <ruta-export.json>',
  '  node scripts/prepare-public-world.mjs --force <ruta-export.json>',
  '  node scripts/prepare-public-world.mjs --check <ruta-export.json>',
  '',
  '--check solo valida y no escribe; --force permite reemplazar un world.public.json existente.',
].join('\n');

const COLLECTIONS = ['buildings', 'objects', 'businesses', 'places'];
const NUMERIC_PARAMS = ['width', 'depth', 'height'];

/** Banderas conocidas en el código actual. Se detectan también otras claves *Migration heredadas. */
const KNOWN_MIGRATION_FLAGS = ['featureMigration', 'placesStructuresMigration', 'worldCleanupMigration'];
const PRESERVED_KEYS = ['animation', 'removedPlaceIds', ...KNOWN_MIGRATION_FLAGS];

const HASH64 = /^[0-9a-f]{64}$/i;
/** `hashBuffer` usa 16 hex como fallback cuando no hay crypto.subtle (contexto HTTP). */
const HASH16 = /^[0-9a-f]{16}$/i;
const SAFE_ID = /^[a-z0-9_]{3,80}$/i;

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function formatFailure(message, errors) {
  return errors.length ? `${message}:\n  - ${errors.join('\n  - ')}` : message;
}

/** quita BOM y parsea; `label` se usa en los mensajes de error. */
async function readJsonFile(filePath, label) {
  let buffer;
  try {
    buffer = await readFile(filePath);
  } catch (error) {
    throw new Error(`No se pudo leer ${label} "${filePath}": ${error.message}`);
  }
  let text = buffer.toString('utf8');
  const bom = text.charCodeAt(0) === 0xfeff;
  if (bom) text = text.slice(1);
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} "${filePath}" no es JSON válido: ${error.message}`);
  }
  return { buffer, value, bom };
}

function parseCli(argv) {
  const options = { help: false, check: false, force: false, source: null };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') options.check = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('-')) throw new Error(`Opción desconocida "${arg}".\n${USAGE}`);
    else positional.push(arg);
  }
  if (options.help) return options;
  if (positional.length !== 1) {
    throw new Error(`Falta la ruta al export de STUDIO (se recibieron ${positional.length} rutas).\n${USAGE}`);
  }
  if (options.check && options.force) {
    throw new Error(`--force no se puede usar con --check (no se va a escribir nada).\n${USAGE}`);
  }
  options.source = positional[0];
  return options;
}

async function loadBuiltinIds(warnings) {
  const { value } = await readJsonFile(MODEL_IDS_PATH, 'el catálogo de modelos');
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new Error(`${MODEL_IDS_PATH} debe ser un array de IDs de modelo (strings no vacíos).`);
  }
  if (value.length !== 16) {
    warnings.push(`${path.basename(MODEL_IDS_PATH)} contiene ${value.length} IDs (se esperaban 16); se usan los IDs presentes.`);
  }
  return new Set(value);
}

/** Rechaza Infinity/NaN en cualquier parte del documento: JSON.stringify los convertiría en null. */
function scanNonFinite(value, trail, errors) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) errors.push(`Número no finito en ${trail}: ${String(value)}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanNonFinite(item, `${trail}[${index}]`, errors));
  } else if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) scanNonFinite(item, `${trail}.${key}`, errors);
  }
}

function requireFinite(value, trail, errors) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    const shown = typeof value === 'number' && !Number.isFinite(value) ? String(value) : JSON.stringify(value);
    errors.push(`${trail} debe ser un número finito (valor: ${shown ?? String(value)}).`);
  }
}

function checkPlacement(item, label, errors, requireParams) {
  if (!isObject(item.placement)) {
    errors.push(`${label}.placement debe ser un objeto.`);
  } else {
    const { position } = item.placement;
    if (!isObject(position)) errors.push(`${label}.placement.position debe ser un objeto con lng/lat.`);
    else {
      requireFinite(position.lng, `${label}.placement.position.lng`, errors);
      requireFinite(position.lat, `${label}.placement.position.lat`, errors);
    }
    requireFinite(item.placement.heading, `${label}.placement.heading`, errors);
    requireFinite(item.placement.scale, `${label}.placement.scale`, errors);
  }
  if (!requireParams) return;
  if (!isObject(item.params)) {
    errors.push(`${label}.params debe ser un objeto con parámetros numéricos.`);
    return;
  }
  for (const key of NUMERIC_PARAMS) requireFinite(item.params[key], `${label}.params.${key}`, errors);
  for (const [key, value] of Object.entries(item.params)) {
    if (typeof value === 'number') requireFinite(value, `${label}.params.${key}`, errors);
  }
}

function checkIds(input, errors) {
  const owners = new Map();
  for (const collection of COLLECTIONS) {
    const seen = new Set();
    input[collection].forEach((item, index) => {
      const label = `${collection}[${index}]`;
      if (!isObject(item)) {
        errors.push(`${label} debe ser un objeto.`);
        return;
      }
      if (typeof item.id !== 'string' || !item.id.trim()) {
        errors.push(`${label}.id debe ser un string no vacío.`);
        return;
      }
      if (seen.has(item.id)) errors.push(`ID duplicado dentro de ${collection}: ${item.id}`);
      seen.add(item.id);
      const previous = owners.get(item.id);
      if (previous && previous !== collection) {
        errors.push(`ID "${item.id}" colisiona entre ${previous} y ${collection}.`);
      } else {
        owners.set(item.id, collection);
      }
    });
  }
  return owners;
}

function checkEntities(input, errors) {
  for (const collection of ['buildings', 'objects']) {
    input[collection].forEach((item, index) => {
      if (!isObject(item)) return;
      const label = `${collection}[${index}] (${typeof item.id === 'string' ? item.id : 'sin id'})`;
      checkPlacement(item, label, errors, true);
    });
  }
  input.places.forEach((place, index) => {
    if (!isObject(place)) return;
    const label = `places[${index}] (${typeof place.id === 'string' ? place.id : 'sin id'})`;
    if (!isObject(place.position)) errors.push(`${label}.position debe ser un objeto con lng/lat.`);
    else {
      requireFinite(place.position.lng, `${label}.position.lng`, errors);
      requireFinite(place.position.lat, `${label}.position.lat`, errors);
    }
  });

  const buildingIds = new Set(
    input.buildings.map((b) => (isObject(b) && typeof b.id === 'string' ? b.id : null)).filter(Boolean),
  );
  input.businesses.forEach((business, index) => {
    if (!isObject(business)) return;
    const label = `businesses[${index}] (${typeof business.id === 'string' ? business.id : 'sin id'})`;
    const { buildingId } = business;
    if (buildingId !== null && buildingId !== undefined) {
      if (typeof buildingId !== 'string' || !buildingIds.has(buildingId)) {
        errors.push(`${label}.buildingId referencia un edificio inexistente: ${JSON.stringify(buildingId)}.`);
      }
    }
  });
}

function checkBundle(bundle, index, errors, warnings) {
  const label = `customModels[${index}]`;
  if (!isObject(bundle)) {
    errors.push(`${label} debe ser un objeto.`);
    return null;
  }
  if (typeof bundle.id !== 'string' || !SAFE_ID.test(bundle.id)) {
    errors.push(`${label}.id debe ser un ID de modelo válido (${String(bundle.id)}).`);
  }
  const aliases = bundle.aliases === undefined ? [] : bundle.aliases;
  if (!Array.isArray(aliases) || aliases.some((a) => typeof a !== 'string' || !SAFE_ID.test(a))) {
    errors.push(`${label}.aliases debe ser un array de IDs válidos.`);
  }

  if (typeof bundle.glb !== 'string' || !bundle.glb.trim()) {
    errors.push(`${label}.glb debe ser una cadena base64 no vacía.`);
  } else {
    const normalized = bundle.glb.replace(/\s+/g, '');
    if (normalized !== bundle.glb) warnings.push(`${label}.glb contenía espacios: se decodificó sin ellos (el bundle se copia tal cual).`);
    if (normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
      errors.push(`${label}.glb no es base64 válido.`);
    } else {
      const decoded = Buffer.from(normalized, 'base64');
      if (decoded.toString('base64') !== normalized) errors.push(`${label}.glb no es base64 canónico válido.`);
      if (decoded.length === 0) errors.push(`${label}.glb decodifica a cero bytes.`);
      if (typeof bundle.size !== 'number' || !Number.isFinite(bundle.size) || bundle.size <= 0) {
        errors.push(`${label}.size debe ser un número finito mayor que cero.`);
      } else if (decoded.length !== bundle.size) {
        errors.push(`${label}.size declara ${bundle.size} bytes pero el GLB decodifica a ${decoded.length}.`);
      }
      const hash = bundle.hash;
      if (hash !== undefined) {
        if (typeof hash !== 'string') {
          errors.push(`${label}.hash debe ser una cadena hexadecimal.`);
        } else if (HASH64.test(hash.trim())) {
          const actual = sha256(decoded);
          if (actual !== hash.trim().toLowerCase()) {
            errors.push(`${label}.hash SHA-256 no coincide: declarado ${hash.trim().toLowerCase()}, calculado ${actual}.`);
          }
        } else if (HASH16.test(hash.trim())) {
          warnings.push(`${label}.hash usa el formato heredado de 16 hex; no se puede verificar con SHA-256.`);
        } else {
          errors.push(`${label}.hash debe tener 64 hex (SHA-256) o 16 hex (fallback heredado): ${hash}.`);
        }
      }
      // Misma validación que el importador de STUDIO: cabecera, chunks y URIs externas.
      validateGlbBuffer(decoded, `${label}.glb`, errors);
    }
  }
  return { id: typeof bundle.id === 'string' ? bundle.id : null, aliases: Array.isArray(aliases) ? aliases : [] };
}

function checkBundles(input, errors, warnings) {
  const raw = input.customModels === undefined ? [] : input.customModels;
  if (!Array.isArray(raw)) {
    errors.push('customModels debe ser un array cuando está presente.');
    return { bundles: [], ids: new Set() };
  }
  const ids = new Set();
  const aliasOwners = new Map();
  raw.forEach((bundle, index) => {
    const info = checkBundle(bundle, index, errors, warnings);
    if (!info) return;
    if (info.id) {
      if (ids.has(info.id)) errors.push(`ID de modelo duplicado en customModels: ${info.id}`);
      ids.add(info.id);
    }
    for (const alias of info.aliases) {
      if (!SAFE_ID.test(alias)) continue;
      if (alias === info.id) {
        warnings.push(`customModels[${index}] repite su propio id como alias: ${alias}.`);
        continue;
      }
      const previous = aliasOwners.get(alias);
      if (previous) errors.push(`Alias de modelo "${alias}" repetido en customModels (${previous} y ${index}).`);
      else aliasOwners.set(alias, index);
    }
  });
  return { bundles: raw, ids };
}

function resolveModelIds(input, builtinIds, customIds, customAliases, errors) {
  const known = new Set([...builtinIds, ...customIds, ...customAliases]);
  const used = new Set();
  const unresolved = new Set();
  for (const collection of ['buildings', 'objects']) {
    input[collection].forEach((item, index) => {
      if (!isObject(item)) return;
      if (typeof item.modelId !== 'string' || !item.modelId.trim()) {
        errors.push(`${collection}[${index}] (${item.id ?? 'sin id'}) no tiene modelId válido.`);
        return;
      }
      if (!known.has(item.modelId)) unresolved.add(item.modelId);
      else used.add(item.modelId);
    });
  }
  if (unresolved.size) {
    errors.push(
      `modelId no resuelto en data/model-ids.json ni en customModels[].id/aliases (no se reasignan): ${[...unresolved].sort().join(', ')}`,
    );
  }
  return [...used].sort();
}

function checkPreservedKeys(input, document, warnings) {
  const migrationKeys = Object.keys(input).filter((key) => /migration/i.test(key));
  const keys = [...new Set([...PRESERVED_KEYS, ...migrationKeys])].filter((key) => hasOwn(input, key));
  const errors = [];
  const absent = [...new Set([...PRESERVED_KEYS, ...migrationKeys])].filter((key) => !hasOwn(input, key));

  // Toda clave del export (excepto customModels) debe llegar intacta al document: así se
  // cubren también banderas de migración heredadas cuyo nombre no esté en la lista conocida.
  for (const key of Object.keys(document)) {
    if (key === 'customModels' || !hasOwn(input, key)) {
      errors.push(`La clave "${key}" aparece en document pero no venía en el export (no se genera).`);
    }
  }
  for (const key of Object.keys(input)) {
    if (key === 'customModels') continue;
    if (!hasOwn(document, key)) errors.push(`La clave "${key}" del export no se conservó en document.`);
    else if (JSON.stringify(document[key]) !== JSON.stringify(input[key])) {
      errors.push(`La clave "${key}" cambió al copiarla al document.`);
    }
  }
  if (absent.length) warnings.push(`Claves opcionales ausentes en el export (NO se generan): ${absent.sort().join(', ')}.`);
  return { keys, errors };
}

function checkNoFiltering(input, document, errors) {
  for (const collection of COLLECTIONS) {
    if (document[collection].length !== input[collection].length) {
      errors.push(`${collection}: el documento de salida no conserva todas las entidades del export (no se filtra).`);
    }
  }
  for (const collection of ['buildings', 'objects', 'places']) {
    input[collection].forEach((item, index) => {
      if (isObject(item) && hasOwn(item, 'visible') && document[collection][index]?.visible !== item.visible) {
        errors.push(`${collection}[${index}].visible cambió en la salida.`);
      }
    });
  }
  input.businesses.forEach((item, index) => {
    if (isObject(item) && hasOwn(item, 'published') && document.businesses[index]?.published !== item.published) {
      errors.push(`businesses[${index}].published cambió en la salida.`);
    }
  });
}

function buildOutput(input, builtinIds, warnings) {
  const errors = [];
  if (!isObject(input)) throw new Error('El export de STUDIO debe ser un objeto JSON.');
  if (input.schemaVersion !== 1) {
    errors.push(`schemaVersion debe ser 1 (se encontró ${JSON.stringify(input.schemaVersion)}).`);
  }
  for (const collection of COLLECTIONS) {
    if (!Array.isArray(input[collection])) errors.push(`Falta el array "${collection}" en el export.`);
  }
  scanNonFinite(input, 'export', errors);
  if (errors.length) throw new Error(formatFailure('Export no válido', errors));

  checkIds(input, errors);
  checkEntities(input, errors);
  const { bundles, ids: customIds } = checkBundles(input, errors, warnings);
  const customAliases = new Set();
  for (const bundle of bundles) {
    if (isObject(bundle) && Array.isArray(bundle.aliases)) {
      for (const alias of bundle.aliases) if (typeof alias === 'string') customAliases.add(alias);
    }
  }
  // registerModel() reserva los 16 IDs built-in: un GLB con el mismo ID haría que el
  // bundle público lanzara al arrancar. Se rechaza antes de generar el dato.versionado.
  const reservedCollisions = [...new Set([...customIds, ...customAliases])].filter((id) => builtinIds.has(id));
  if (reservedCollisions.length) {
    errors.push(
      `customModels usa IDs/alias reservados por modelos built-in (no se pueden registrar en el bundle público): ${reservedCollisions.sort().join(', ')}`,
    );
  }
  const modelIds = resolveModelIds(input, builtinIds, customIds, customAliases, errors);

  const document = { ...input };
  delete document.customModels;
  checkNoFiltering(input, document, errors);
  const preserved = checkPreservedKeys(input, document, warnings);
  errors.push(...preserved.errors);

  if (errors.length) throw new Error(formatFailure('Validación fallida; no se escribió nada', errors));

  return {
    output: {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      source: { file: null, sha256: null },
      counts: {
        buildings: input.buildings.length,
        objects: input.objects.length,
        businesses: input.businesses.length,
        places: input.places.length,
        models: bundles.length,
      },
      modelIds,
      document,
      models: bundles,
    },
    preservedKeys: preserved.keys,
  };
}

function printSummary({ sourceName, sourceSha, outputSha, counts, modelIds, preservedKeys, warnings, check }) {
  const lines = [
    check ? 'RESUMEN (--check, sin escritura)' : 'RESUMEN',
    `  Fuente: ${sourceName}`,
    `  SHA-256 source: ${sourceSha}`,
    `  SHA-256 output${check ? ' (proyectado)' : ''}: ${outputSha}`,
    `  Conteos: buildings=${counts.buildings}, objects=${counts.objects}, businesses=${counts.businesses}, places=${counts.places}, models=${counts.models}`,
    `  Model IDs usados (${modelIds.length}): ${modelIds.join(', ') || '(ninguno)'}`,
    `  Claves conservadas sin generar: ${preservedKeys.join(', ') || '(ninguna)'}`,
    `  Advertencias (${warnings.length}):`,
    ...warnings.map((warning) => `    - ${warning}`),
  ];
  console.log(lines.join('\n'));
}

async function assertNotOverwritten(force, warnings) {
  if (!existsSync(OUTPUT_PATH)) return;
  let existingSha;
  try {
    existingSha = sha256(await readFile(OUTPUT_PATH));
  } catch (error) {
    throw new Error(`Existe ${OUTPUT_PATH} pero no se pudo leer para calcular su SHA-256: ${error.message}`);
  }
  if (!force) {
    throw new Error(
      `${OUTPUT_PATH} ya existe (SHA-256 ${existingSha}). No se sobrescribe sin --force.`,
    );
  }
  warnings.push(`Se reemplazará ${path.basename(OUTPUT_PATH)} existente (SHA-256 anterior ${existingSha}).`);
}

/**
 * Genera el mundo público sin leer ni escribir archivos. Lo usan el CLI y el endpoint
 * de desarrollo de STUDIO para que la validación y la forma del JSON sean idénticas.
 */
export async function buildPublicWorld(input, options = {}) {
  const { warnings = [], sourceName = null, sourceSha256 = null } = options;
  const builtinIds = await loadBuiltinIds(warnings);
  const { output, preservedKeys } = buildOutput(input, builtinIds, warnings);

  output.source.file = sourceName;
  output.source.sha256 = sourceSha256;

  const hidden = output.document.buildings.filter((b) => isObject(b) && b.visible === false).length
    + output.document.objects.filter((o) => isObject(o) && o.visible === false).length
    + (output.document.places ?? []).filter((p) => isObject(p) && p.visible === false).length;
  const drafts = output.document.businesses.filter((b) => isObject(b) && b.published === false).length;
  warnings.push(`Sin filtrado por published/visible: se conservan ${hidden} entidades ocultas y ${drafts} comercios no publicados.`);

  return { output, serialized: JSON.stringify(output, null, 2), warnings, preservedKeys };
}

/** Escritura atómica compartida por el CLI y el endpoint local. */
export async function writePublicWorld(serialized) {
  try {
    await writeFile(TMP_PATH, serialized, 'utf8');
    await rename(TMP_PATH, OUTPUT_PATH);
  } catch (error) {
    await unlink(TMP_PATH).catch(() => {});
    throw new Error(`No se pudo escribir ${OUTPUT_PATH}: ${error.message}`);
  }
  return OUTPUT_PATH;
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }

  const sourcePath = path.resolve(process.cwd(), options.source);
  if (sourcePath === OUTPUT_PATH) {
    throw new Error('La ruta de origen no puede ser data/world.public.json (salida del script).');
  }
  const warnings = [];
  if (!options.check) await assertNotOverwritten(options.force, warnings);

  const { buffer, value: input, bom } = await readJsonFile(sourcePath, 'el export de STUDIO');
  if (bom) warnings.push('El export tenía BOM; se ignoró para parsearlo (el archivo original no se modifica).');
  const sourceSha = sha256(buffer);

  const { output, serialized, preservedKeys } = await buildPublicWorld(input, {
    warnings,
    sourceName: path.basename(sourcePath),
    sourceSha256: sourceSha,
  });

  const outputSha = sha256(Buffer.from(serialized, 'utf8'));
  printSummary({
    sourceName: path.basename(sourcePath),
    sourceSha,
    outputSha,
    counts: output.counts,
    modelIds: output.modelIds,
    preservedKeys,
    warnings,
    check: options.check,
  });

  if (options.check) {
    console.log('Modo --check: validación correcta; no se escribió ningún archivo.');
    return;
  }

  // Segunda comprobación para cubrir una carrera con otro proceso durante la validación.
  if (!options.force && existsSync(OUTPUT_PATH)) await assertNotOverwritten(false, warnings);
  await writePublicWorld(serialized);
  console.log(`Escrito: ${OUTPUT_PATH}`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    await main();
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
