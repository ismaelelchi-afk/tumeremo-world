#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wranglerBin = path.join(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler',
);

const target = process.argv[2];
if (target !== 'public' && target !== 'studio') {
  console.error('Uso: node scripts/deploy-cloudflare.mjs <public|studio>');
  process.exit(1);
}

const isPublic = target === 'public';
const distDirName = isPublic ? 'dist-public' : 'dist-studio';
const distDir = path.join(projectRoot, distDirName);

function requireEnv(entries) {
  const missing = entries.filter(([name]) => !process.env[name] || !process.env[name].trim());
  if (missing.length === 0) return;
  console.error('Faltan variables de entorno para el despliegue:');
  for (const [name, description] of missing) console.error(`  - ${name} (${description})`);
  console.error('Configúralas en tu entorno local; no las escribas en el repositorio.');
  process.exit(1);
}

/**
 * El WORLD público se despliega como Worker con Static Assets. La configuración
 * debe existir y ser válida: así Wrangler no genera una configuración automática
 * incompleta ni puede elegir otro directorio que no sea dist-public.
 */
function assertPublicConfig() {
  const configPath = path.join(projectRoot, 'wrangler.jsonc');
  if (!fs.existsSync(configPath)) {
    console.error('Falta wrangler.jsonc en la raíz; Wrangler generaría una configuración automática incompleta.');
    process.exit(1);
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    console.error(`wrangler.jsonc no es JSON válido: ${error.message}`);
    process.exit(1);
  }
  const problems = [];
  if (config.name !== 'tumeremo-world') problems.push('name debe ser "tumeremo-world"');
  if (config.assets?.directory !== './dist-public') problems.push('assets.directory debe ser "./dist-public"');
  if (config.main !== undefined) problems.push('no se permite "main" (WORLD de solo assets)');
  if (problems.length > 0) {
    console.error(`wrangler.jsonc no es coherente con el WORLD público: ${problems.join('; ')}.`);
    process.exit(1);
  }
}

if (!fs.existsSync(distDir) || !fs.statSync(distDir).isDirectory()) {
  console.error(`No existe el directorio ${distDirName}/. Ejecuta primero "npm run build:${target}".`);
  process.exit(1);
}

let args;
if (isPublic) {
  requireEnv([
    ['CLOUDFLARE_ACCOUNT_ID', 'ID de la cuenta de Cloudflare'],
    ['CLOUDFLARE_API_TOKEN', 'token de Wrangler/API con permisos de Workers'],
    ['PUBLIC_SITE_URL', 'URL pública HTTPS del WORLD (p. ej. https://tumeremo.com/)'],
  ]);
  let publicSiteUrl;
  try {
    publicSiteUrl = new URL(process.env.PUBLIC_SITE_URL.trim());
  } catch {
    console.error('PUBLIC_SITE_URL no es una URL válida; debe ser HTTPS (p. ej. https://tumeremo.com/).');
    process.exit(1);
  }
  if (publicSiteUrl.protocol !== 'https:') {
    console.error(`PUBLIC_SITE_URL debe usar HTTPS (se encontró ${JSON.stringify(process.env.PUBLIC_SITE_URL)}).`);
    process.exit(1);
  }
  if (publicSiteUrl.username || publicSiteUrl.password) {
    console.error('PUBLIC_SITE_URL no debe incluir credenciales incrustadas (user:pass@host).');
    process.exit(1);
  }
  if (!publicSiteUrl.hostname) {
    console.error(`PUBLIC_SITE_URL debe incluir un host válido: ${JSON.stringify(process.env.PUBLIC_SITE_URL)}.`);
    process.exit(1);
  }
  // Reconstruir desde protocolo, host y ruta descarta query, fragmento y userinfo.
  const pathname = `${publicSiteUrl.pathname.replace(/\/+$/, '')}/`;
  process.env.PUBLIC_SITE_URL = `${publicSiteUrl.protocol}//${publicSiteUrl.host}${pathname}`;
  console.log(`PUBLIC_SITE_URL: ${process.env.PUBLIC_SITE_URL}`);
  assertPublicConfig();

  const verify = spawnSync(process.execPath, [path.join(__dirname, 'verify-bundle.mjs'), 'dist-public'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  if (verify.status !== 0) {
    console.error('El bundle público no pasó la verificación; no se desplegará.');
    process.exit(verify.status ?? 1);
  }

  for (const [script, label] of [
    ['verify-wrangler.mjs', 'la configuración de Wrangler'],
    ['verify-seo.mjs', 'los archivos públicos de SEO'],
  ]) {
    const check = spawnSync(process.execPath, [path.join(projectRoot, 'scripts', script)], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: process.env,
    });
    if (check.status !== 0) {
      console.error(`La verificación de ${label} (${script}) falló; no se desplegará.`);
      process.exit(check.status ?? 1);
    }
  }

  // Sin argumentos de directorio ni --assets: Wrangler usa exclusivamente
  // assets.directory de wrangler.jsonc (./dist-public).
  args = ['deploy', '--config', 'wrangler.jsonc'];
  console.log('Desplegando ./dist-public como Worker "tumeremo-world" (Workers Static Assets)...');
} else {
  requireEnv([
    ['CLOUDFLARE_ACCOUNT_ID', 'ID de la cuenta de Cloudflare'],
    ['CLOUDFLARE_API_TOKEN', 'token de Wrangler/API con permiso Pages:Edit'],
    ['CF_PAGES_PROJECT_STUDIO', 'nombre del proyecto Pages privado (STUDIO)'],
  ]);
  const projectName = process.env.CF_PAGES_PROJECT_STUDIO.trim();
  args = ['pages', 'deploy', distDir, `--project-name=${projectName}`, '--branch=main'];
  console.log(`Desplegando ${distDirName}/ en el proyecto Pages privado "${projectName}" (branch main)...`);
}

// Se ejecuta el binario local fijado en devDependencies; nunca npx wrangler,
// que podría resolver una versión distinta o descargarla en el momento.
if (!fs.existsSync(wranglerBin)) {
  console.error(`No existe ${path.relative(projectRoot, wranglerBin)}. Ejecuta "npm ci" antes de desplegar.`);
  process.exit(1);
}

const result = spawnSync(wranglerBin, args, {
  cwd: projectRoot,
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(`No se pudo ejecutar el Wrangler local: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(`El despliegue falló con código ${result.status ?? 'desconocido'}.`);
  process.exit(result.status ?? 1);
}
