#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const target = process.argv[2];
if (target !== 'public' && target !== 'studio') {
  console.error('Uso: node scripts/deploy-cloudflare.mjs <public|studio>');
  process.exit(1);
}

const isPublic = target === 'public';
const projectEnvName = isPublic ? 'CF_PAGES_PROJECT_PUBLIC' : 'CF_PAGES_PROJECT_STUDIO';
const distDirName = isPublic ? 'dist-public' : 'dist-studio';

const missing = [
  ['CLOUDFLARE_ACCOUNT_ID', 'ID de la cuenta de Cloudflare'],
  ['CLOUDFLARE_API_TOKEN', 'token de Wrangler/API con permiso Pages:Edit'],
  [projectEnvName, isPublic ? 'nombre del proyecto Pages público' : 'nombre del proyecto Pages privado (STUDIO)'],
].filter(([name]) => !process.env[name] || !process.env[name].trim());

if (missing.length > 0) {
  console.error('Faltan variables de entorno para el despliegue:');
  for (const [name, description] of missing) {
    console.error(`  - ${name} (${description})`);
  }
  console.error('Configúralas en tu entorno local; no las escribas en el repositorio.');
  process.exit(1);
}

const projectName = process.env[projectEnvName].trim();
const distDir = path.join(projectRoot, distDirName);

if (!fs.existsSync(distDir) || !fs.statSync(distDir).isDirectory()) {
  console.error(`No existe el directorio ${distDirName}/. Ejecuta primero "npm run build:${target}".`);
  process.exit(1);
}

const args = [
  'pages',
  'deploy',
  distDir,
  `--project-name=${projectName}`,
  '--branch=main',
];

console.log(`Desplegando ${distDirName}/ en el proyecto Pages "${projectName}" (branch main)...`);
const result = spawnSync('npx', ['wrangler', ...args], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(`No se pudo ejecutar npx wrangler: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(`El despliegue falló con código ${result.status ?? 'desconocido'}.`);
  process.exit(result.status ?? 1);
}
