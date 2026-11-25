import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { loadPublicWorld } from "./config/load-public-world";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// El servidor de desarrollo sirve el mismo documento congelado que el build público.
const { document, models } = loadPublicWorld(process.env.PUBLIC_WORLD_DATA);

/**
 * Vite no aplica `define` a módulos servidos en desarrollo. El HTML inyecta los
 * mismos globals que el build define, antes de que se ejecute cualquier módulo.
 */
function injectDevPublicWorld(): Plugin {
  const json = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
  const script =
    `window.__PUBLIC_WORLD_DOCUMENT__ = ${json(document)};\n` +
    `window.__PUBLIC_WORLD_MODELS__ = ${json(models)};`;
  return {
    name: "inject-dev-public-world",
    apply: "serve",
    transformIndexHtml(html: string, ctx: { path: string }) {
      if (/studio(\.html)?\/?$/.test(ctx.path)) return html;
      return { html, tags: [{ tag: "script", children: script, injectTo: "head-prepend" }] };
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), injectDevPublicWorld()],
  define: {
    __PUBLIC_WORLD_DOCUMENT__: JSON.stringify(document),
    __PUBLIC_WORLD_MODELS__: JSON.stringify(models),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
