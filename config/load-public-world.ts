import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface PublicWorldFile {
  document: unknown;
  models: unknown[];
}

/** Carga el mundo publicado una sola vez para las dos configuraciones de Vite. */
export function loadPublicWorld(explicitPath?: string): { document: unknown; models: unknown[] } {
  const worldPath = explicitPath ? path.resolve(explicitPath) : path.join(ROOT, 'data', 'world.public.json');
  const label = path.relative(ROOT, worldPath) || worldPath;

  let raw: string;
  try {
    raw = fs.readFileSync(worldPath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(
        `Falta ${label}. Ejecuta "npm run prepare:world -- <export.json>" para generar el export del navegador antes de compilar la app pública; no se usan datos vacíos ni fallbacks.`,
      );
    }
    throw new Error(`No se pudo leer ${label}: ${String(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} no es JSON válido: ${String(error)}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} debe contener un objeto JSON con \`document\` y \`models\`.`);
  }
  const data = parsed as Record<string, unknown>;
  if (data.document === undefined || data.document === null) {
    throw new Error(`${label} no contiene \`document\`; ejecuta "npm run prepare:world -- <export.json>".`);
  }
  if (!Array.isArray(data.models)) {
    throw new Error(`${label} no contiene \`models\` como array; ejecuta "npm run prepare:world -- <export.json>".`);
  }

  return { document: data.document, models: data.models } satisfies PublicWorldFile;
}
