import type { IncomingMessage, ServerResponse } from "node:http";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { loadPublicWorld } from "./config/load-public-world";
import { buildPublicWorld, sha256, writePublicWorld } from "./scripts/prepare-public-world.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Estado mutable del WORLD en desarrollo. «Actualizar WORLD» de STUDIO reemplaza
 * este objeto y reescribe data/world.public.json; el build público lee ese mismo archivo.
 */
let publicWorld = loadPublicWorld(process.env.PUBLIC_WORLD_DATA);

/**
 * Rutas oficiales: `/` y `/index.html` (WORLD), `/studio.html` (STUDIO) y
 * `/usuario` (USUARIO). Vite resuelve `/studio` a `/studio.html` por su fallback
 * de HTML, así que las rutas no oficiales se bloquean antes de ese fallback.
 */
function officialRoutes(): Plugin {
  const isUnofficial = (pathname: string) =>
    pathname === "/studio" ||
    pathname === "/studio/" ||
    pathname.startsWith("/usuario/");

  const blockUnofficial = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const pathname = (req.url ?? "").split("?")[0];
    if (isUnofficial(pathname)) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }
    next();
  };

  return {
    name: "official-routes",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [pathname, ...query] = (req.url ?? "").split("?");
        if (pathname === "/usuario") {
          req.url = `/studio.html${query.length ? `?${query.join("?")}` : ""}`;
        }
        next();
      });
      server.middlewares.use(blockUnofficial);
    },
    configurePreviewServer(server) {
      server.middlewares.use(blockUnofficial);
    },
  };
}

/**
 * Endpoint exclusivo de `npm run dev`. Recibe el export actual de STUDIO, usa el
 * generador público compartido y actualiza el WORLD servido en `/` sin recargar
 * Vite ni ejecutar `build:public`. No existe en los bundles ni en Cloudflare.
 */
function localWorldUpdate(): Plugin {
  const MAX_BODY_BYTES = 32 * 1024 * 1024;

  const isLoopback = (req: IncomingMessage) => {
    const address = req.socket.remoteAddress ?? "";
    return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
  };

  const json = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

  return {
    name: "local-world-update",
    apply: (_config, env) => env.command === "serve" && env.mode !== "production",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url ?? "").split("?")[0];
        if (pathname !== "/__local-world/update") return next();

        const fail = (status: number, error: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(json({ ok: false, error: typeof error === "string" ? error : String(error) }));
        };

        if (req.method !== "POST") return fail(405, "Solo se admite POST.");
        if (!isLoopback(req)) return fail(403, "Solo se admite desde localhost.");

        const host = req.headers.host;
        const origin = req.headers.origin;
        if (origin) {
          try {
            if (new URL(origin).host !== host) return fail(403, "Origen no permitido.");
          } catch {
            return fail(400, "Origen no válido.");
          }
        }

        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) return fail(413, "El export es demasiado grande.");
          chunks.push(Buffer.from(chunk));
        }
        const body = Buffer.concat(chunks);

        let input: unknown;
        try {
          input = JSON.parse(body.toString("utf8"));
        } catch {
          return fail(400, "El cuerpo no es JSON válido.");
        }

        try {
          const { output, serialized } = await buildPublicWorld(input, {
            sourceName: "studio:actualizar-world-local",
            sourceSha256: sha256(body),
          });
          await writePublicWorld(serialized);
          publicWorld = { document: output.document, models: output.models };
          server.ws.send({ type: "full-reload", path: "/index.html" });

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(
            json({
              ok: true,
              counts: output.counts,
              generatedAt: output.generatedAt,
              sha256: sha256(Buffer.from(serialized, "utf8")),
            }),
          );
        } catch (error) {
          fail(400, error instanceof Error ? error.message : error);
        }
      });
    },
  };
}

/**
 * Vite no aplica `define` a módulos servidos en desarrollo. El HTML inyecta los
 * mismos globals que el build define, antes de que se ejecute cualquier módulo.
 * El valor se calcula por petición para reflejar una actualización local reciente.
 */
function injectDevPublicWorld(): Plugin {
  return {
    name: "inject-dev-public-world",
    apply: "serve",
    transformIndexHtml(html: string, ctx: { path: string }) {
      if (ctx.path === "/studio.html" || ctx.path === "/usuario") return html;
      const json = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
      const script =
        `window.__PUBLIC_WORLD_DOCUMENT__ = ${json(publicWorld.document)};\n` +
        `window.__PUBLIC_WORLD_MODELS__ = ${json(publicWorld.models)};`;
      return { html, tags: [{ tag: "script", children: script, injectTo: "head-prepend" }] };
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  appType: "mpa",
  plugins: [react(), tailwindcss(), viteSingleFile(), officialRoutes(), localWorldUpdate(), injectDevPublicWorld()],
  define: {
    __PUBLIC_WORLD_DOCUMENT__: JSON.stringify(publicWorld.document),
    __PUBLIC_WORLD_MODELS__: JSON.stringify(publicWorld.models),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
