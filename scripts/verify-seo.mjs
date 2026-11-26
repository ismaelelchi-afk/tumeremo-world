#!/usr/bin/env node
/**
 * Verifica el SEO de los artefactos ya generados (solo lectura, sin build ni red).
 *
 * Uso: node scripts/verify-seo.mjs [distPublicDir] [distStudioDir]
 * Por omisión: dist-public y dist-studio, relativos a la raíz del repositorio.
 * Códigos de salida: 0 = correcto; 1 = hay problemas.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DEFAULT_CANONICAL = 'https://tumeremo.com/';
const TOKEN = '__PUBLIC_SITE_URL__';
const OG_IMAGE_RE = /^og-image\.(png|jpe?g|webp|gif|svg)$/i;
const PRIVATE_REFS = [
  '/studio.html',
  '/usuario',
  '/__local-world/update',
  'tumeremo-world:document:v1',
  'glb-models',
  'localStorage',
  'indexedDB',
  'setItem(',
];
const DEMO_SCHEMA_TOKENS = [
  'LocalBusiness',
  'Restaurant',
  'Store',
  'Review',
  'aggregateRating',
  'Offer',
  'Product',
  'telephone',
  'openingHours',
];

const errors = [];

function ok(message) {
  console.log(`OK · ${message}`);
}

function fail(message) {
  errors.push(message);
  console.error(`FALLO · ${message}`);
}

function normalizeSiteUrl(raw) {
  const value = String(raw ?? '').trim() || DEFAULT_CANONICAL;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`PUBLIC_SITE_URL no es una URL válida: ${JSON.stringify(value)}.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`PUBLIC_SITE_URL debe usar https: (se encontró ${JSON.stringify(value)}).`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('PUBLIC_SITE_URL no debe incluir credenciales incrustadas (user:pass@host).');
  }
  if (!parsed.hostname) {
    throw new Error(`PUBLIC_SITE_URL debe incluir un host válido: ${JSON.stringify(value)}.`);
  }
  // Reconstruir desde protocolo, host y ruta descarta query, fragmento y userinfo.
  const base = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  return `${base.replace(/\/+$/, '')}/`;
}

/** Devuelve el HTML sin los scripts de JavaScript; conserva JSON-LD y el body estático. */
function staticHtml(html) {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (full, attrs) => {
    const type = (attr(attrs, 'type') ?? '').toLowerCase();
    return type === 'application/ld+json' ? full : '';
  });
}

function isFile(file) {
  return existsSync(file) && statSync(file).isFile();
}

function readRequiredFile(file, label) {
  if (!isFile(file)) {
    fail(`Falta ${label}.`);
    return null;
  }
  try {
    const text = readFileSync(file, 'utf8');
    if (text.length === 0) {
      fail(`${label} está vacío.`);
      return null;
    }
    return text;
  } catch (error) {
    fail(`No se pudo leer ${label}: ${error.message}`);
    return null;
  }
}

function attr(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return match ? match[2] : null;
}

function tags(html, tagName) {
  return html.match(new RegExp(`<${tagName}\\b[^>]*>`, 'gi')) || [];
}

function findMeta(head, key) {
  const wanted = key.toLowerCase();
  for (const tag of tags(head, 'meta')) {
    const name = (attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase();
    if (name === wanted) return tag;
  }
  return null;
}

function metaContent(head, key) {
  const tag = findMeta(head, key);
  return tag ? attr(tag, 'content') : null;
}

function linkWithRel(head, tagName, relValue) {
  for (const tag of tags(head, tagName)) {
    const rels = (attr(tag, 'rel') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    if (rels.includes(relValue.toLowerCase())) return tag;
  }
  return null;
}

function headOf(html) {
  const end = html.toLowerCase().indexOf('</head>');
  return end === -1 ? html : html.slice(0, end);
}

function checkHead(head, canonical) {
  const htmlTag = tags(head, 'html')[0] ?? '';
  if ((attr(htmlTag, 'lang') ?? '').toLowerCase() !== 'es') {
    fail('index.html debe incluir <html lang="es">.');
  } else {
    ok('html lang="es"');
  }

  const titleMatch = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : '';
  if (!title.includes('Tumeremo') || !title.includes('Municipio Sifontes')) {
    fail('El <title> debe contener "Tumeremo" y "Municipio Sifontes".');
  } else {
    ok('<title> con Tumeremo y Municipio Sifontes');
  }

  const description = metaContent(head, 'description');
  if (!description || !description.includes('Tumeremo') || !description.includes('Bolívar')) {
    fail('La meta description debe contener "Tumeremo" y "Bolívar".');
  } else {
    ok('meta description con Tumeremo y Bolívar');
  }

  const canonicalTag = linkWithRel(head, 'link', 'canonical');
  const href = canonicalTag ? (attr(canonicalTag, 'href') ?? '') : '';
  if (!canonicalTag || href !== canonical || !/^https:\/\//i.test(href) || !href.endsWith('/')) {
    fail(`Falta o es incorrecto <link rel="canonical" href="${canonical}"> (se encontró ${JSON.stringify(href || null)}).`);
  } else {
    ok(`canonical absoluto con barra final: ${canonical}`);
  }

  const robotsTag = findMeta(head, 'robots');
  const robotsContent = robotsTag ? (attr(robotsTag, 'content') ?? '') : '';
  if (!robotsContent.toLowerCase().replace(/\s+/g, '').includes('index,follow')) {
    fail('Falta <meta name="robots" content="index,follow">.');
  } else {
    ok('meta robots index,follow');
  }
  if (/\bnoindex\b/i.test(head)) {
    fail('index.html no debe contener "noindex".');
  } else {
    ok('sin noindex en index.html');
  }

  if (!linkWithRel(head, 'link', 'icon')) {
    fail('Falta <link rel="icon"> en el head.');
  } else {
    ok('link rel="icon" presente');
  }

  const ogChecks = [
    ['og:type', (value) => value.toLowerCase() === 'website'],
    ['og:site_name', (value) => value.trim().length > 0],
    ['og:title', (value) => value.trim().length > 0],
    ['og:description', (value) => value.trim().length > 0],
    ['og:url', (value) => value === canonical],
    ['og:image', (value) => value.trim().length > 0],
  ];
  for (const [key, predicate] of ogChecks) {
    const value = metaContent(head, key);
    if (value === null || !predicate(value)) {
      fail(`${key} ausente o incorrecto (se encontró ${JSON.stringify(value)}); ${key === 'og:url' ? `debe ser ${canonical}` : 'debe estar presente'}.`);
    } else {
      ok(`${key} [OK]`);
    }
  }

  for (const key of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
    const value = metaContent(head, key);
    if (value === null || value.trim().length === 0) {
      fail(`${key} ausente o vacío.`);
    } else {
      ok(`${key} [OK]`);
    }
  }
}

function checkBody(html, shell) {
  for (const [pattern, label] of [[/<h1\b/i, '<h1'], [/<h2\b/i, '<h2'], [/<main\b/i, '<main']]) {
    if (!pattern.test(html)) fail(`index.html debe contener al menos un ${label}.`);
    else ok(`${label} presente`);
  }

  const noscriptRe = /<noscript\b[^>]*>([\s\S]*?)<\/noscript\s*>/gi;
  const noscripts = [];
  let match;
  while ((match = noscriptRe.exec(html)) !== null) noscripts.push(match[1]);
  if (!noscripts.some((text) => text.includes('Tumeremo') && text.includes('Municipio Sifontes'))) {
    fail('El bloque <noscript> debe contener "Tumeremo" y "Municipio Sifontes".');
  } else {
    ok('<noscript> con Tumeremo y Municipio Sifontes');
  }

  const before = errors.length;
  // Solo el HTML estático escrito para SEO debe estar libre de rutas privadas.
  // El bundle JS embebido contiene textos heredados (p. ej. /usuario en los
  // catálogos i18n) que no son enlaces ni metadatos del documento público.
  const lowered = shell.toLowerCase();
  for (const needle of [...PRIVATE_REFS, 'example.com', 'tumeremo.example.com']) {
    if (lowered.includes(needle.toLowerCase())) {
      fail(`index.html no debe contener la referencia privada o de ejemplo ${JSON.stringify(needle)}.`);
    }
  }
  if (errors.length === before) ok('index.html sin referencias privadas ni dominios de ejemplo');
}

function checkJsonLd(head, canonical) {
  const blocks = [];
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match;
  while ((match = scriptRe.exec(head)) !== null) {
    if ((attr(match[1], 'type') ?? '').toLowerCase() === 'application/ld+json') {
      blocks.push(match[2].trim());
    }
  }

  if (blocks.length !== 1) {
    fail(`El head debe contener exactamente un bloque <script type="application/ld+json"> (se encontraron ${blocks.length}).`);
    return;
  }

  const block = blocks[0];
  let data;
  try {
    data = JSON.parse(block);
  } catch (error) {
    fail(`El bloque JSON-LD no es JSON válido: ${error.message}`);
    return;
  }

  const graph = data && Array.isArray(data['@graph']) ? data['@graph'] : null;
  if (!graph) {
    fail('El JSON-LD debe contener un @graph con WebSite, WebPage y Place.');
  } else {
    for (const type of ['WebSite', 'WebPage', 'Place']) {
      const found = graph.some((node) => {
        const types = Array.isArray(node?.['@type']) ? node['@type'] : [node?.['@type']];
        return types.some((item) => typeof item === 'string' && item.toLowerCase() === type.toLowerCase());
      });
      if (!found) fail(`El @graph del JSON-LD debe incluir @type ${type}.`);
      else ok(`JSON-LD @type ${type} [OK]`);
    }
  }

  if (!block.includes(canonical)) {
    fail(`El bloque JSON-LD debe contener el canonical ${canonical}.`);
  } else {
    ok('JSON-LD con el canonical');
  }

  const before = errors.length;
  for (const token of DEMO_SCHEMA_TOKENS) {
    if (new RegExp(`\\b${token}\\b`, 'i').test(block)) {
      fail(`El JSON-LD no debe contener ${JSON.stringify(token)} (datos de demostración no deben parecer negocios reales).`);
    }
  }
  if (errors.length === before) ok('JSON-LD sin tipos ni propiedades de negocio/revisión');
}

function checkPublicFiles(dir, canonical) {
  const dirLabel = path.relative(ROOT, dir) || 'dist-public';
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    fail(`Falta el directorio ${dirLabel}/.`);
    return;
  }

  const indexHtml = readRequiredFile(path.join(dir, 'index.html'), `${dirLabel}/index.html`);
  if (indexHtml !== null) {
    const before = errors.length;
    if (indexHtml.includes(TOKEN)) fail(`${dirLabel}/index.html contiene el token ${TOKEN} sin sustituir.`);
    if (errors.length === before) ok(`${dirLabel}/index.html sin tokens pendientes`);
    // En el build single-file el JS se inyecta dentro del <head>, antes del
    // <noscript>/<main>. Recortar por prefijo perdería el body SEO; por eso se
    // eliminan únicamente los scripts de JavaScript y se conserva el HTML estático.
    const shell = staticHtml(indexHtml);
    const head = headOf(shell);
    ok('análisis limitado al HTML estático (JS embebido excluido)');
    checkHead(head, canonical);
    checkBody(shell, shell);
    checkJsonLd(head, canonical);
  }

  const robots = readRequiredFile(path.join(dir, 'robots.txt'), `${dirLabel}/robots.txt`);
  if (robots !== null) {
    const before = errors.length;
    if (robots.includes(TOKEN)) fail(`${dirLabel}/robots.txt contiene el token ${TOKEN} sin sustituir.`);
    for (const needle of ['User-agent: *', 'Allow: /', `Sitemap: ${canonical}sitemap.xml`]) {
      if (!robots.includes(needle)) fail(`${dirLabel}/robots.txt debe contener ${JSON.stringify(needle)}.`);
    }
    if (errors.length === before) ok(`${dirLabel}/robots.txt correcto`);
  }

  const sitemap = readRequiredFile(path.join(dir, 'sitemap.xml'), `${dirLabel}/sitemap.xml`);
  if (sitemap !== null) {
    const before = errors.length;
    if (sitemap.includes(TOKEN)) fail(`${dirLabel}/sitemap.xml contiene el token ${TOKEN} sin sustituir.`);
    if (!sitemap.includes(`<loc>${canonical}</loc>`)) {
      fail(`${dirLabel}/sitemap.xml debe contener <loc>${canonical}</loc>.`);
    }
    const locCount = (sitemap.match(/<loc\b[^>]*>/gi) || []).length;
    if (locCount !== 1) fail(`${dirLabel}/sitemap.xml debe tener exactamente un elemento <loc> (se encontraron ${locCount}).`);
    for (const needle of ['/index.html', '/studio', '/usuario', 'example.com', 'localhost']) {
      if (sitemap.toLowerCase().includes(needle)) {
        fail(`${dirLabel}/sitemap.xml no debe contener ${JSON.stringify(needle)}.`);
      }
    }
    if (errors.length === before) ok(`${dirLabel}/sitemap.xml con una sola URL pública`);
  }

  const favicon = path.join(dir, 'favicon.svg');
  if (!isFile(favicon)) {
    fail(`Falta ${dirLabel}/favicon.svg.`);
  } else if (statSync(favicon).size === 0) {
    fail(`${dirLabel}/favicon.svg está vacío.`);
  } else {
    ok(`${dirLabel}/favicon.svg presente`);
  }

  let ogImages = [];
  try {
    ogImages = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && OG_IMAGE_RE.test(entry.name))
      .filter((entry) => statSync(path.join(dir, entry.name)).size > 0);
  } catch (error) {
    fail(`No se pudo inspeccionar ${dirLabel}/ en busca de og-image: ${error.message}`);
  }
  if (ogImages.length === 0) {
    fail(`Falta ${dirLabel}/og-image.* (png, jpg, jpeg, webp, gif o svg) con contenido.`);
  } else {
    ok(`${dirLabel}/${ogImages[0].name} presente`);
  }

  const notFound = readRequiredFile(path.join(dir, '404.html'), `${dirLabel}/404.html`);
  if (notFound !== null) {
    const before = errors.length;
    if (!/<h1\b/i.test(notFound)) fail(`${dirLabel}/404.html debe contener un <h1>.`);
    if (!notFound.includes('href="/"')) fail(`${dirLabel}/404.html debe contener un enlace href="/".`);
    if (/canonical/i.test(notFound)) fail(`${dirLabel}/404.html no debe contener canonical.`);
    if (errors.length === before) ok(`${dirLabel}/404.html con enlace de vuelta al inicio`);
  }
}

function checkStudioFiles(dir) {
  const dirLabel = path.relative(ROOT, dir) || 'dist-studio';
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    fail(`Falta el directorio ${dirLabel}/.`);
    return;
  }

  const studio = readRequiredFile(path.join(dir, 'studio.html'), `${dirLabel}/studio.html`);
  if (studio !== null) {
    const tag = findMeta(studio, 'robots');
    const content = tag ? (attr(tag, 'content') ?? '') : '';
    if (!/\bnoindex\b/i.test(content)) {
      fail(`${dirLabel}/studio.html debe contener <meta name="robots" content="noindex">.`);
    } else {
      ok(`${dirLabel}/studio.html con noindex`);
    }
  }

  const headers = readRequiredFile(path.join(dir, '_headers'), `${dirLabel}/_headers`);
  if (headers !== null) {
    if (!headers.includes('X-Robots-Tag: noindex, nofollow')) {
      fail(`${dirLabel}/_headers debe contener "X-Robots-Tag: noindex, nofollow".`);
    } else {
      ok(`${dirLabel}/_headers con X-Robots-Tag`);
    }
  }

  const redirects = readRequiredFile(path.join(dir, '_redirects'), `${dirLabel}/_redirects`);
  if (redirects !== null) {
    if (!redirects.includes('/usuario /studio.html 200')) {
      fail(`${dirLabel}/_redirects debe contener "/usuario /studio.html 200".`);
    } else {
      ok(`${dirLabel}/_redirects con la ruta privada`);
    }
  }
}

function main() {
  let canonical;
  try {
    canonical = normalizeSiteUrl(process.env.PUBLIC_SITE_URL);
  } catch (error) {
    fail(error.message);
    console.error('RESUMEN · FALLO: canonical no válido (código 1).');
    process.exitCode = 1;
    return;
  }
  console.log(`Canonical: ${canonical}`);

  const publicDir = path.resolve(ROOT, process.argv[2] || 'dist-public');
  const studioDir = path.resolve(ROOT, process.argv[3] || 'dist-studio');
  checkPublicFiles(publicDir, canonical);
  checkStudioFiles(studioDir);

  console.log('\nRESUMEN');
  if (errors.length > 0) {
    console.error(`FALLO · ${errors.length} comprobación(es) incorrecta(s) (código 1).`);
    process.exitCode = 1;
    return;
  }
  console.log('OK · Verificación SEO correcta (código 0).');
}

try {
  main();
} catch (error) {
  console.error(`FALLO · Error inesperado: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
