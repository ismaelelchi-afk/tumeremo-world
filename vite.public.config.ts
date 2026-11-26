import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { loadPublicWorld } from "./config/load-public-world";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Dominio candidato; PUBLIC_SITE_URL debe fijarse explícitamente en producción. */
const DEFAULT_SITE_URL = "https://tumeremo.com/";
const SITE_URL_TOKEN = "__PUBLIC_SITE_URL__";

function normalizeSiteUrl(raw?: string): string {
  const value = (raw ?? "").trim() || DEFAULT_SITE_URL;
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error(`PUBLIC_SITE_URL no es una URL válida: ${value} (${String(error)})`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`PUBLIC_SITE_URL debe usar https: ${value}`);
  }
  if (url.username || url.password) {
    throw new Error("PUBLIC_SITE_URL no debe incluir credenciales incrustadas (user:pass@host).");
  }
  if (!url.hostname) {
    throw new Error(`PUBLIC_SITE_URL debe incluir un host válido: ${value}`);
  }
  url.hash = "";
  url.search = "";
  // Reconstruir desde protocolo, host y ruta descarta query, fragmento y userinfo.
  const base = `${url.protocol}//${url.host}${url.pathname}`;
  return `${base.replace(/\/+$/, "")}/`;
}

const publicSiteUrl = normalizeSiteUrl(process.env.PUBLIC_SITE_URL);

/**
 * El archivo publicado conserva todos los modelos; el bundle solo inyecta los
 * modelos personalizados que el documento público referencia. Así un GLB de
 * demostración no descargado ni decodificado no penaliza la carga inicial.
 * No se modifica data/world.public.json ni el validador de datos.
 */
function projectReferencedModels(document: unknown, models: unknown[]): unknown[] {
  const used = new Set<string>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.modelId === "string" && record.modelId.trim()) {
      used.add(record.modelId.trim());
    }
    for (const [key, child] of Object.entries(record)) {
      if (key === "i18n" || key === "defaults" || key === "limits") continue;
      visit(child);
    }
  };

  const doc = document as Record<string, unknown> | null;
  for (const collection of ["buildings", "objects", "businesses", "places"]) {
    if (Array.isArray(doc?.[collection])) visit(doc?.[collection]);
  }

  const projected = models.filter((model) => {
    if (!model || typeof model !== "object") return false;
    const record = model as Record<string, unknown>;
    if (typeof record.id !== "string") return false;
    const aliases = Array.isArray(record.aliases) ? record.aliases : [];
    return [record.id, ...aliases].some(
      (name) => typeof name === "string" && used.has(name.trim()),
    );
  });

  if (projected.length !== models.length) {
    console.log(
      `[public] Modelos inyectados: ${projected.length}/${models.length} ` +
        `(se omiten ${models.length - projected.length} sin referencia en el documento).`,
    );
  }
  return projected;
}

/** Sustituye el dominio canónico en los archivos estáticos ya copiados al bundle. */
function replacePublicSiteUrl(siteUrl: string): Plugin {
  return {
    name: "replace-public-site-url",
    apply: "build",
    closeBundle() {
      const outDir = path.resolve(__dirname, process.env.PUBLIC_OUT_DIR || "dist-public");
      for (const name of ["index.html", "robots.txt", "sitemap.xml"]) {
        const target = path.join(outDir, name);
        if (!fs.existsSync(target)) {
          if (name !== "index.html") {
            throw new Error(`Falta ${path.relative(__dirname, target)}; revisa la carpeta public/.`);
          }
          continue;
        }
        const before = fs.readFileSync(target, "utf8");
        const after = before.split(SITE_URL_TOKEN).join(siteUrl);
        if (after.includes(SITE_URL_TOKEN)) {
          throw new Error(`Quedó ${SITE_URL_TOKEN} sin sustituir en ${name}.`);
        }
        if (after !== before) fs.writeFileSync(target, after);
      }
      console.log(`[public] canonical: ${siteUrl}`);
    },
  };
}

const { document, models } = loadPublicWorld(process.env.PUBLIC_WORLD_DATA);
const injectedModels = projectReferencedModels(document, models);

export default defineConfig({
  mode: "public",
  publicDir: path.resolve(__dirname, "public"),
  plugins: [react(), tailwindcss(), viteSingleFile(), replacePublicSiteUrl(publicSiteUrl)],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  define: {
    __PUBLIC_WORLD_DOCUMENT__: JSON.stringify(document),
    __PUBLIC_WORLD_MODELS__: JSON.stringify(injectedModels),
  },
  build: {
    outDir: process.env.PUBLIC_OUT_DIR || "dist-public",
    emptyOutDir: true,
  },
});
