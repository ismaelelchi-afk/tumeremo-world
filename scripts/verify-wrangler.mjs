#!/usr/bin/env node
/**
 * Verifica que la configuración activa de Wrangler corresponda al WORLD público.
 *
 * Comprueba que `wrangler.jsonc` es una configuración de Workers Static Assets
 * válida para este proyecto: nombre `tumeremo-world`, único directorio
 * `./dist-public`, sin Worker propio ni rutas en la configuración y sin archivos
 * privados en el bundle. No ejecuta builds ni despliegues.
 *
 * Uso: node scripts/verify-wrangler.mjs
 * Códigos de salida: 0 = correcto; 1 = configuración o bundle inconsistentes.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { editorMarkerErrors, scanEditorMarkers } from './verify-world.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CONFIG_PATH = path.join(ROOT, 'wrangler.jsonc');
const PUBLIC_DIR_NAME = 'dist-public';
const FORBIDDEN_FILES = ['studio.html', '_headers', '_redirects', '_worker.js', 'wrangler.jsonc', '.dev.vars'];

const errors = [];

function fail(message) {
  errors.push(message);
}

function readConfig() {
  if (!existsSync(CONFIG_PATH) || !statSync(CONFIG_PATH).isFile()) {
    throw new Error(`Falta ${CONFIG_PATH}. Wrangler generaría una configuración automática incompleta si no existe.`);
  }
  const raw = readFileSync(CONFIG_PATH, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${path.basename(CONFIG_PATH)} debe ser JSON válido: ${error.message}`);
  }
}

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full));
    else if (entry.isFile()) found.push(full);
  }
  return found;
}

function main() {
  const config = readConfig();
  console.log('CONFIG · wrangler.jsonc (Workers Static Assets)');

  if (config.name !== 'tumeremo-world') {
    fail(`name debe ser "tumeremo-world" (se encontró ${JSON.stringify(config.name)}).`);
  } else {
    console.log(`  name: ${config.name} [OK]`);
  }

  const directory = config.assets?.directory;
  if (directory !== `./${PUBLIC_DIR_NAME}`) {
    fail(`assets.directory debe ser "./${PUBLIC_DIR_NAME}" (se encontró ${JSON.stringify(directory)}).`);
  } else {
    console.log(`  assets.directory: ${directory} [OK]`);
  }

  // Un `main` o un binding convertirían el despliegue en un Worker con código:
  // este WORLD es de solo lectura y no debe ejecutar lógica del editor.
  for (const key of ['main', 'route', 'routes']) {
    if (config[key] !== undefined) fail(`La clave ${JSON.stringify(key)} no debe estar en esta configuración de solo assets.`);
  }
  if (config.assets?.binding !== undefined) fail('assets.binding no debe estar: no hay código de Worker que lo consuma.');
  if (config.assets?.run_worker_first !== undefined) fail('assets.run_worker_first no debe estar: el WORLD no ejecuta Worker.');
  if (config.assets?.not_found_handling === 'single-page-application') {
    fail('assets.not_found_handling no puede ser "single-page-application": ocultaría rutas privadas sirviendo index.html.');
  }
  if (config.assets?.not_found_handling !== undefined && config.assets?.not_found_handling !== '404-page') {
    fail(`assets.not_found_handling no reconocido: ${JSON.stringify(config.assets.not_found_handling)}.`);
  }

  const serialized = JSON.stringify(config);
  for (const forbidden of ['dist-studio', 'studio.html', 'local-world/update', 'pages_build_output_dir']) {
    if (serialized.includes(forbidden)) fail(`La configuración no debe contener ${JSON.stringify(forbidden)}.`);
  }

  const distDir = path.resolve(ROOT, PUBLIC_DIR_NAME);
  if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
    fail(`Falta ${PUBLIC_DIR_NAME}/. Ejecuta "npm run build:public" antes de verificar/deploy.`);
  } else {
    const files = walk(distDir);
    const indexPath = path.join(distDir, 'index.html');
    if (!files.includes(indexPath)) fail(`Falta ${PUBLIC_DIR_NAME}/index.html.`);
    for (const file of files) {
      const relative = path.relative(distDir, file);
      if (FORBIDDEN_FILES.includes(relative) || FORBIDDEN_FILES.includes(path.basename(file))) {
        fail(`${path.join(PUBLIC_DIR_NAME, relative)} no debe publicarse en el WORLD.`);
      }
    }
    console.log(`  ${PUBLIC_DIR_NAME}/: ${files.length} archivo(s), sin artefactos privados [OK]`);

    if (existsSync(indexPath)) {
      const html = readFileSync(indexPath, 'utf8');
      const markers = scanEditorMarkers(html);
      for (const error of editorMarkerErrors(markers)) fail(error);
      console.log(`  index.html: sin marcadores de STUDIO [OK]`);
    }
  }

  if (errors.length > 0) {
    console.error('\nProblemas:');
    for (const error of errors) console.error(`  - ${error}`);
    console.error('\nFALLO: la configuración de Wrangler no es coherente con el bundle público (código 1).');
    process.exitCode = 1;
    return;
  }
  console.log('\nOK: Wrangler publica solo ./dist-public (código 0).');
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
