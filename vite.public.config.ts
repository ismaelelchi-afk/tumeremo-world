import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicWorldPath = path.resolve(process.env.PUBLIC_WORLD_DATA || path.join(__dirname, "data", "world.public.json"));
const label = path.relative(__dirname, publicWorldPath) || publicWorldPath;

function loadPublicWorld(): { document: unknown; models: unknown } {
  let raw: string;
  try {
    raw = fs.readFileSync(publicWorldPath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(
        `Falta ${label}. Ejecuta "npm run prepare:world" (scripts/prepare-public-world.mjs) para generar el export del navegador antes de compilar la app pública; no se usan datos vacíos ni fallbacks.`,
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

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} debe contener un objeto JSON con \`document\` y \`models\`.`);
  }

  const data = parsed as Record<string, unknown>;
  if (data.document === undefined || data.document === null) {
    throw new Error(`${label} no contiene \`document\`; ejecuta "npm run prepare:world".`);
  }
  if (!Array.isArray(data.models)) {
    throw new Error(`${label} no contiene \`models\` como array; ejecuta "npm run prepare:world".`);
  }

  return { document: data.document, models: data.models };
}

const { document, models } = loadPublicWorld();

export default defineConfig({
  mode: "public",
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  define: {
    __PUBLIC_WORLD_DOCUMENT__: JSON.stringify(document),
    __PUBLIC_WORLD_MODELS__: JSON.stringify(models),
  },
  build: {
    outDir: process.env.PUBLIC_OUT_DIR || "dist-public",
    emptyOutDir: true,
  },
});
