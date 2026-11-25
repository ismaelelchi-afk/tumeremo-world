import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { loadPublicWorld } from "./config/load-public-world";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { document, models } = loadPublicWorld(process.env.PUBLIC_WORLD_DATA);

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
