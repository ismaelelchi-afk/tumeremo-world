import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const studioInput = fileURLToPath(new URL("./studio.html", import.meta.url));
const studioHeadersSource = fileURLToPath(
  new URL("./cloudflare/_headers.studio", import.meta.url),
);
const studioOutDir = path.resolve(__dirname, "dist-studio");

/** El host público es configuración del despliegue, nunca el origen de STUDIO. */
function publicWorldUrl(): string {
  const raw = process.env.VITE_PUBLIC_WORLD_URL?.trim();
  if (!raw) {
    throw new Error(
      'Falta VITE_PUBLIC_WORLD_URL. Define la URL absoluta del WORLD público antes de compilar STUDIO, p. ej. VITE_PUBLIC_WORLD_URL=https://<dominio-publico>/ npm run build:studio.',
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch (error) {
    throw new Error(`VITE_PUBLIC_WORLD_URL no es una URL válida: ${String(error)}`);
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error(`VITE_PUBLIC_WORLD_URL debe usar http(s): ${url.protocol}`);
  }
  url.hash = '';
  return url.toString();
}

const configuredWorldUrl = publicWorldUrl();

function copyStudioHeaders(): Plugin {
  return {
    name: "copy-studio-headers",
    apply: "build",
    closeBundle() {
      fs.mkdirSync(studioOutDir, { recursive: true });
      fs.copyFileSync(studioHeadersSource, path.join(studioOutDir, "_headers"));
    },
  };
}

export default defineConfig({
  mode: "studio",
  plugins: [react(), tailwindcss(), viteSingleFile(), copyStudioHeaders()],
  define: {
    __STUDIO_PUBLIC_WORLD_URL__: JSON.stringify(configuredWorldUrl),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist-studio",
    emptyOutDir: true,
    rollupOptions: {
      input: studioInput,
    },
  },
});
