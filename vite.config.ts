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
 * Mundo leído al arrancar, usado por `define` en builds. En desarrollo, la vista pública
 * relee `data/world.public.json` en cada petición: «Actualizar WORLD» escribe ese archivo.
 */
const initialPublicWorld = loadPublicWorld(process.env.PUBLIC_WORLD_DATA);

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

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function modelIdsOf(bundle: unknown): string[] {
  if (!isRecord(bundle)) return [];
  const ids: string[] = [];
  if (typeof bundle.id === 'string') ids.push(bundle.id);
  if (Array.isArray(bundle.aliases)) {
    for (const alias of bundle.aliases) if (typeof alias === 'string') ids.push(alias);
  }
  return ids;
}

/**
 * STUDIO exporta los GLB desde IndexedDB. Si esa base está vacía en una sesión nueva,
 * el export no trae `customModels` aunque el documento referencie modelos ya publicados.
 * Reutilizamos solo los bundles publicados que faltan y que el documento necesita, sin
 * tocar entidades ni modelos y sin reconstruir nada desde la semilla.
 */
function withPublishedModelBundles(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const referenced = new Set<string>();
  for (const key of ['buildings', 'objects']) {
    const items = input[key];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (isRecord(item) && typeof item.modelId === 'string') referenced.add(item.modelId);
    }
  }
  if (!referenced.size) return input;

  const provided = Array.isArray(input.customModels) ? input.customModels : [];
  const providedIds = new Set<string>();
  for (const bundle of provided) for (const id of modelIdsOf(bundle)) providedIds.add(id);

  let published: { document: unknown; models: unknown[] };
  try {
    published = loadPublicWorld(process.env.PUBLIC_WORLD_DATA);
  } catch {
    return input;
  }
  const missing = published.models.filter((bundle) =>
    modelIdsOf(bundle).some((id) => referenced.has(id) && !providedIds.has(id)),
  );
  if (!missing.length) return input;
  return { ...input, customModels: [...provided, ...missing] };
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
          if (status >= 400) console.error(`[local-world] ${status}:`, error);
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
          const { output, serialized } = await buildPublicWorld(withPublishedModelBundles(input), {
            sourceName: "studio:actualizar-world-local",
            sourceSha256: sha256(body),
          });
          await writePublicWorld(serialized);

          // Devolución verificable: el cliente puede comparar lo publicado con el
          // documento de trabajo sin abrir el archivo ni adivinar qué se escribió.
          const placements: Record<string, unknown> = {};
          const publishedDocument = isRecord(output.document) ? output.document : {};
          const placedEntities = [
            ...(Array.isArray(publishedDocument.buildings) ? publishedDocument.buildings : []),
            ...(Array.isArray(publishedDocument.objects) ? publishedDocument.objects : []),
          ];
          for (const entity of placedEntities) {
            if (isRecord(entity) && typeof entity.id === "string" && isRecord(entity.placement)) {
              placements[entity.id] = entity.placement;
            }
          }
          console.info(`[local-world] publicado: ${JSON.stringify(placements)}`);
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
              placements,
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
      // Leer el archivo en cada petición evita servir una copia en memoria obsoleta
      // cuando el WORLD se regenera fuera del botón de STUDIO.
      const current = loadPublicWorld(process.env.PUBLIC_WORLD_DATA);
      const json = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
      const script =
        `window.__PUBLIC_WORLD_DOCUMENT__ = ${json(current.document)};\n` +
        `window.__PUBLIC_WORLD_MODELS__ = ${json(current.models)};`;
      return { html, tags: [{ tag: "script", children: script, injectTo: "head-prepend" }] };
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  appType: "mpa",
  plugins: [react(), tailwindcss(), viteSingleFile(), officialRoutes(), localWorldUpdate(), injectDevPublicWorld()],
  define: {
    __PUBLIC_WORLD_DOCUMENT__: JSON.stringify(initialPublicWorld.document),
    __PUBLIC_WORLD_MODELS__: JSON.stringify(initialPublicWorld.models),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
