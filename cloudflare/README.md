# Despliegue en Cloudflare

## Arquitectura de despliegue

| Destino | Tecnología | Configuración activa | Directorio publicado | Acceso |
| --- | --- | --- | --- | --- |
| WORLD público (`/`, `/index.html`) | Cloudflare Workers + Static Assets | `wrangler.jsonc` en la raíz | **solo** `./dist-public` | Público, sin Cloudflare Access |
| STUDIO y USUARIO (`/studio.html`, `/usuario`) | Cloudflare Pages (Direct Upload) | sin archivo Wrangler en la raíz | `./dist-studio` | Host privado protegido con Cloudflare Access |

`wrangler.jsonc` es la **única** configuración activa de Wrangler y pertenece al WORLD público:

```jsonc
{
  "name": "tumeremo-world",
  "compatibility_date": "2026-11-25",
  "assets": {
    "directory": "./dist-public",
    "not_found_handling": "404-page"
  }
}
```

Es una configuración *assets-only*: no tiene `main`, ni binding de assets, ni rutas. El WORLD es de
solo lectura; no ejecuta código de STUDIO ni sirve un fallback SPA que pudiera devolver `index.html`
para rutas privadas. Con `not_found_handling = "404-page"`, las rutas públicas desconocidas devuelven
la página `404.html` real, nunca `index.html`. Cloudflare canonicaliza `/index.html` a `/` y la
etiqueta canonical del WORLD apunta siempre a `/`. No hay `routes`/`route` en el archivo: el dominio
o la ruta se asocian en el dashboard de Cloudflare.

La existencia de este archivo impide que Wrangler ejecute su configuración automática (que es la que
generó un `assets` sin `directory`). **No** ejecutes `wrangler setup`, `wrangler init`,
`wrangler deploy <directorio>` ni `wrangler deploy --assets ...` en la raíz: usa siempre
`npm run deploy:public`, que pasa `--config wrangler.jsonc` y no argumentos de directorio.

## Qué configurar en Cloudflare

1. **Worker público `tumeremo-world`.** Se crea con el primer despliegue o desde *Workers & Pages*;
   el nombre debe coincidir con `wrangler.jsonc`. No es un proyecto Pages.
2. **Dominio del WORLD.** En el Worker, añade el dominio personalizado (o una ruta) para el host
   público y deja el DNS proxied por Cloudflare. No añadas rutas que sirvan `/studio.html` ni
   `/usuario` desde este Worker. La URL candidata es `https://tumeremo.com/`: sigue siendo un
   candidato hasta verificar el dominio o la ruta reales. En este trabajo no se hicieron cambios de
   DNS ni de dominio.
3. **Acceso público.** No hay política de Access sobre el host público.
4. **Token de API (variable de entorno, nunca versionada).** Para el Worker:
   `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_API_TOKEN` con permisos de Workers
   (*Workers Scripts:Edit* y *Account Settings:Read*, o la plantilla *Edit Cloudflare Workers*).
5. **Proyecto Pages privado para STUDIO.** Crea un proyecto Pages distinto y una política de
   **Cloudflare Access** sobre su host (por ejemplo `studio.<dominio>`). Necesitas
   `CF_PAGES_PROJECT_STUDIO` y un token con *Pages:Edit*. Sube `dist-studio/`, que incluye
   `_headers` (`no-store` y cabeceras de endurecimiento) y `_redirects` (`/usuario` → `studio.html`
   con rewrite 200; rutas no oficiales → 404). El token y el ID se entregan en la sesión; no se
   escriben en archivos versionados.
6. **Dominio de STUDIO y `VITE_PUBLIC_WORLD_URL`.** Asocia el dominio privado y usa la URL absoluta
   del WORLD al compilar STUDIO; no se deriva del host de STUDIO.
7. **Workers Builds (opcional).** Si importas el repositorio desde el dashboard, Wrangler detectará
   `wrangler.jsonc` y no creará una configuración automática. Configura build
   `npm run build:public` y deploy `npm run deploy:public`, con raíz del repositorio. Para el host
   privado, compila `VITE_PUBLIC_WORLD_URL=<url> npm run build:studio` y sube `dist-studio/` al
   proyecto Pages separado.

## Variables de entorno

| Nombre | Uso |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cuenta destino de Wrangler (obligatoria para ambos despliegues). |
| `CLOUDFLARE_API_TOKEN` | Token para Workers (público) y Pages (privado); no versionar. |
| `CF_PAGES_PROJECT_STUDIO` | Nombre del proyecto Pages privado (STUDIO). |
| `VITE_PUBLIC_WORLD_URL` | URL absoluta del WORLD, requerida por `build:studio`; debe ser la URL pública real. |
| `PUBLIC_SITE_URL` | URL canónica del build público; reemplaza al candidato `https://tumeremo.com/`. Obligatoria en `deploy:public`. |

Ya no existe `CF_PAGES_PROJECT_PUBLIC`: el WORLD público se despliega como Worker con el nombre fijo
`tumeremo-world` de `wrangler.jsonc`.

## Comandos

```bash
npm run prepare:world -- <ruta-al-export-de-STUDIO.json>   # genera data/world.public.json
npm run check:all                                          # incluye verify:wrangler y verify:seo
export CLOUDFLARE_ACCOUNT_ID='<ID_DE_CUENTA>'
export CLOUDFLARE_API_TOKEN='<TOKEN>'
export CF_PAGES_PROJECT_STUDIO='<NOMBRE_PROYECTO_PRIVADO>'
export VITE_PUBLIC_WORLD_URL='https://<DOMINIO_PUBLICO>/'
export PUBLIC_SITE_URL='https://<DOMINIO_PUBLICO>/'

npm run deploy:public   # exige PUBLIC_SITE_URL; build:public + verify:wrangler + verify:seo + wrangler deploy --config wrangler.jsonc
npm run build:studio    # falla si falta VITE_PUBLIC_WORLD_URL
npm run deploy:studio   # Pages Direct Upload de dist-studio/
```

Verificación previa al despliegue:

```bash
VITE_PUBLIC_WORLD_URL='https://tumeremo.com/' PUBLIC_SITE_URL='https://tumeremo.com/' npm run check:all
npm run verify:world -- --bundle dist-public/index.html
npm run verify:seo
npm run verify:wrangler
```

`npm run deploy:public` exige `PUBLIC_SITE_URL`, ejecuta primero `npm run build:public` y, antes de
llamar a Wrangler, `verify:wrangler` (nombre, `assets.directory=./dist-public` y
`not_found_handling="404-page"`) y `verify:seo` (`scripts/verify-seo.mjs`: metadatos, canonical,
OG/Twitter, JSON-LD (`WebSite`, `WebApplication`, `WebPage`, `Place`), robots, sitemap, favicon/imagen OG, 404 y `noindex` privado). `check:all` incluye
ambos verificadores. No ejecutes `wrangler deploy` directamente: sin esas comprobaciones se pierde la
verificación y el rollback se mantiene promoviendo una versión anterior del Worker.

Cada build genera un HTML autocontenido:

- `build:public` → `dist-public/index.html`: WORLD con el documento y solo los modelos GLB personalizados referenciados por él inyectados.
- `build:studio` → `dist-studio/studio.html`, `_headers` y `_redirects`: STUDIO/USUARIO privados.

`dist-public/` no contiene `studio.html`, `_headers`, `_redirects` ni marcadores del editor.
`dist-studio/` no se publica en el Worker bajo ninguna circunstancia.

Los archivos estáticos SEO (`robots.txt`, `sitemap.xml`, `favicon.svg`, `favicon.png`, `og-image.png` y
`404.html`) se copian **solo** a `dist-public`. `vite.studio.config.ts` define `publicDir: false`, así
que `dist-studio` sigue siendo exactamente `studio.html` + `_headers` + `_redirects`. STUDIO y
USUARIO conservan `noindex` en metadatos y `X-Robots-Tag: noindex,nofollow`; el host privado requiere
Cloudflare Access (no configurable desde el repositorio).

## Rollback y caché

- **WORLD (Worker):** *Workers & Pages → tumeremo-world → Versions* → seleccionar una versión anterior
  y promoverla a producción.
- **STUDIO (Pages):** *Deployments* → seleccionar un despliegue anterior → *Rollback*.
- **Caché:** si se sirve HTML antiguo, purgar la zona del dominio desde *Caching → Configuration →
  Purge Everything* (o solo la URL concreta). El host privado debe devolver `no-store`, aunque la
  purga puede ser necesaria para contenido ya cacheado.

## Pasos que dependen de Google

Quedan fuera del repositorio la inspección de URL en Search Console, el envío de `sitemap.xml`, la
Rich Results Test y los datos de campo de Core Web Vitals. No se afirma que Google haya indexado el
sitio.

## Archivos que deben subirse a GitHub

Versionar: `wrangler.jsonc`, `package.json`, `package-lock.json`, `.gitignore`,
`scripts/` (incluidos `verify-wrangler.mjs` y `verify-seo.mjs`), `public/` (recursos SEO y favicons),
`cloudflare/README.md`, `README.md`, `data/README.md` y `data/world.public.json`.

**No** versionar ni subir: `dist-public/`, `dist-studio/`, `.wrangler/`, `.dev.vars`, tokens, IDs de
cuenta ni credenciales. Los artefactos se generan en cada despliegue con `npm run build:public` (y
`npm run build:studio` para el host privado).
