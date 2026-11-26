#!/usr/bin/env node
/**
 * Verificación superficial de los dos bundles de Vite (sin ejecutar builds).
 *
 * Uso:
 *   node scripts/verify-bundle.mjs <dist-public|dist-studio> [archivo]
 *
 * El argumento opcional `[archivo]` sustituye el HTML comprobado dentro del
 * directorio indicado. Las comprobaciones de estructura del directorio siempre
 * se aplican. Solo se leen archivos: no se construye ni se modifica nada.
 *
 * Códigos de salida: 0 = correcto; 1 = bundle inválido / error de uso.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { editorMarkerErrors, printEditorMarkers, scanEditorMarkers, studioMarkerHits } from './verify-world.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const USAGE = [
  'Uso:',
  '  node scripts/verify-bundle.mjs <dist-public|dist-studio> [archivo]',
  '',
  'Ejemplos:',
  '  node scripts/verify-bundle.mjs dist-public',
  '  node scripts/verify-bundle.mjs dist-public dist-public/index.html',
  '  node scripts/verify-bundle.mjs dist-studio',
  '',
  'No ejecuta builds; solo comprueba los archivos ya generados.',
].join('\n');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseArgs(argv) {
  if (argv.some((arg) => arg === '--help' || arg === '-h')) return { help: true };
  if (argv.length < 1 || argv.length > 2) throw new Error(`Se esperaban 1 o 2 argumentos.\n${USAGE}`);
  const target = argv[0];
  if (target !== 'dist-public' && target !== 'dist-studio') {
    throw new Error(`Destino desconocido ${JSON.stringify(target)} (usar dist-public o dist-studio).\n${USAGE}`);
  }
  return { target, file: argv[1] ?? null };
}

/** Prioriza la ruta relativa al directorio del bundle; después la ruta relativa al cwd. */
function resolveCandidate(file, distDir) {
  if (path.isAbsolute(file)) return path.resolve(file);
  const insideDist = path.resolve(distDir, file);
  if (existsSync(insideDist)) return insideDist;
  return path.resolve(process.cwd(), file);
}

function printProblems(errors) {
  if (!errors.length) return;
  console.error(`  Problemas (${errors.length}):`);
  for (const error of errors) console.error(`    - ${error}`);
}

function readHtml(filePath, errors) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    errors.push(`No se pudo leer el HTML ${JSON.stringify(filePath)}.`);
    return null;
  }
  const html = readFileSync(filePath, 'utf8');
  console.log(`  Tamaño: ${Buffer.byteLength(html)} bytes; SHA-256: ${sha256(Buffer.from(html, 'utf8'))}`);
  return html;
}

/** Detecta <meta name="robots" content="noindex..."> con cualquier orden de atributos. */
function hasRobotsNoindex(html) {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  return metaTags.some((tag) => {
    const isRobots = /\bname\s*=\s*(?:"robots"|'robots'|robots)(?=[\s/>])/i.test(tag);
    if (!isRobots) return false;
    const content = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+))/i);
    const value = content ? (content[1] ?? content[2] ?? content[3] ?? '') : '';
    return /\bnoindex\b/i.test(value);
  });
}

function verifyPublic(distDir, file) {
  const errors = [];
  const indexPath = path.join(distDir, 'index.html');
  const studioPath = path.join(distDir, 'studio.html');

  console.log('TARGET · dist-public');
  console.log(`  Directorio: ${distDir}`);

  if (!existsSync(indexPath) || !statSync(indexPath).isFile()) {
    errors.push('Falta dist-public/index.html.');
  } else {
    console.log(`  index.html: presente [OK]`);
  }
  if (existsSync(studioPath)) {
    errors.push('Existe dist-public/studio.html: el bundle público no debe incluir el editor.');
  } else {
    console.log('  studio.html: ausente [OK]');
  }
  for (const privateFile of ['_headers', '_redirects']) {
    const privatePath = path.join(distDir, privateFile);
    if (existsSync(privatePath)) {
      errors.push(`Existe dist-public/${privateFile}: la configuración privada no debe publicarse.`);
    } else {
      console.log(`  ${privateFile}: ausente [OK]`);
    }
  }

  const chosen = file ? resolveCandidate(file, distDir) : indexPath;
  console.log(`  HTML comprobado: ${chosen}`);
  const html = readHtml(chosen, errors);
  if (html !== null) {
    const markers = scanEditorMarkers(html);
    printEditorMarkers(markers);
    errors.push(...editorMarkerErrors(markers));
  }

  printProblems(errors);
  return errors.length === 0;
}

function verifyStudio(distDir, file) {
  const errors = [];
  const studioHtml = path.join(distDir, 'studio.html');

  console.log('TARGET · dist-studio');
  console.log(`  Directorio: ${distDir}`);

  let chosen = null;
  if (file) {
    chosen = resolveCandidate(file, distDir);
  } else if (existsSync(studioHtml) && statSync(studioHtml).isFile()) {
    chosen = studioHtml;
  } else {
    errors.push('No se encontró dist-studio/studio.html.');
  }
  console.log(`  HTML de entrada: ${chosen ?? '(ninguno)'}`);

  if (chosen) {
    const html = readHtml(chosen, errors);
    if (html !== null) {
      const markers = scanEditorMarkers(html);
      console.log('  Marcadores de editor (al menos uno presente en STUDIO):');
      for (const { marker, count } of markers) console.log(`    - ${JSON.stringify(marker)}: ${count}`);
      const hits = studioMarkerHits(markers);
      if (!hits.length) {
        errors.push('El HTML de STUDIO no contiene TUMEREMO STUDIO, studio.menuExport ni importDocumentJson.');
      } else {
        console.log(`  Marcadores presentes: ${hits.map(({ marker, count }) => `${marker}=${count}`).join(', ')} [OK]`);
      }
      const hasNoindex = hasRobotsNoindex(html);
      console.log(`  meta robots noindex: ${hasNoindex ? 'presente [OK]' : 'FALLO'}`);
      if (!hasNoindex) errors.push('El HTML de STUDIO no contiene <meta name="robots" content="noindex">.');
    }
  }

  const headersPath = path.join(distDir, '_headers');
  if (!existsSync(headersPath) || !statSync(headersPath).isFile()) {
    errors.push('Falta dist-studio/_headers.');
  } else {
    const headers = readFileSync(headersPath, 'utf8');
    const hasNoStore = /no-store/i.test(headers);
    const hasRobotsHeader = /x-robots-tag:\s*noindex,\s*nofollow/i.test(headers);
    console.log(`  _headers: presente; no-store: ${hasNoStore ? 'sí [OK]' : 'FALLO'}`);
    console.log(`  _headers X-Robots-Tag: noindex, nofollow: ${hasRobotsHeader ? 'sí [OK]' : 'FALLO'}`);
    if (!hasNoStore) errors.push('dist-studio/_headers no contiene "no-store".');
    if (!hasRobotsHeader) errors.push('dist-studio/_headers no contiene "X-Robots-Tag: noindex, nofollow".');
  }

  const redirectsPath = path.join(distDir, '_redirects');
  if (!existsSync(redirectsPath) || !statSync(redirectsPath).isFile()) {
    errors.push('Falta dist-studio/_redirects (rutas privadas oficiales).');
  } else {
    const redirects = readFileSync(redirectsPath, 'utf8');
    const routes = redirects
      .split('\n')
      .map((line) => line.trim().replace(/\s+/g, ' '))
      .filter((line) => line.length > 0 && !line.startsWith('#'));
    const expected = [
      '/usuario /studio.html 200',
      '/studio 404',
      '/studio/ 404',
      '/usuario/ 404',
      '/usuario/* 404',
    ];
    const missing = expected.filter((route) => !routes.includes(route));
    console.log(`  _redirects: ${missing.length ? 'FALTO' : 'OK'} (${routes.length} reglas)`);
    for (const route of missing) errors.push(`dist-studio/_redirects no contiene la regla ${JSON.stringify(route)}.`);
  }

  printProblems(errors);
  return errors.length === 0;
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(USAGE);
    return;
  }

  const distDir = path.resolve(ROOT, options.target);
  if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
    throw new Error(`No existe el directorio ${distDir}. Ejecuta antes el build correspondiente (este script no lo ejecuta).`);
  }

  const ok = options.target === 'dist-public' ? verifyPublic(distDir, options.file) : verifyStudio(distDir, options.file);
  if (ok) {
    console.log('\nOK: bundle verificado (código 0).');
  } else {
    console.error('\nFALLO: el bundle no cumple la verificación (código 1).');
    process.exitCode = 1;
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
