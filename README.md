# Tumeremo World

Plataforma digital bilingüe (español y portugués brasileño) de Tumeremo, Venezuela. Un mismo proyecto reúne dos experiencias que comparten el motor, el documento de datos y el sistema de idiomas:

- **WORLD**: la vista pública para explorar el territorio.
- **STUDIO**: el editor para construir y mantener ese territorio.

El mapa base procede de datos abiertos de OpenStreetMap servidos por OpenFreeMap. No se necesitan claves de API ni credenciales para ejecutar la aplicación.

## Experiencias

### WORLD

Vista de consulta del mundo digital: mapa real en 2D o 3D, edificios y objetos ubicados en el territorio, puntos de interés y comercios. Incluye búsqueda con filtros, fichas informativas, temas día/noche, geolocalización y panel de atribuciones. El WORLD muestra únicamente el contenido publicado y visible; el estado del documento (original o borrador) se indica en la cabecera cuando existe un borrador local. Cada elemento tiene un enlace profundo `#/item/<kind>/<id>` que restaura la selección y la cámara.

### STUDIO

Editor territorial con vista previa del WORLD mediante el mismo documento. Organiza el trabajo en cinco áreas: biblioteca de modelos, escena, puntos, comercios y propiedades. Dispone de herramientas de selección, movimiento, rotación y escalado, alineación de edificios con la vía más cercana, duplicado de entidades, puntos y comercios, eliminación, control de visibilidad y edición de parámetros de cada modelo. Las copias son aditivas y bilingües: el original queda intacto y un comercio duplicado empieza sin publicar. Las confirmaciones se resuelven en la propia interfaz, sin cuadros bloqueantes del navegador. También permite gestionar los 14 puntos de interés y sus comercios asociados, deshacer y rehacer cambios, guardar automáticamente en el navegador, importar y exportar el documento en JSON y restaurar el estado original.

La biblioteca incluye 13 modelos procedimentales (9 edificios y 4 objetos). STUDIO también acepta modelos propios en formato GLB: se validan, se almacenan en IndexedDB y pueden viajar dentro del JSON exportado para reutilizarlos en otra instalación.

## Funcionalidades

**WORLD**

- Mapa vectorial real con vista 2D/3D, inclinación, rotación y recorrido de apertura.
- Temas día/noche y brújula con reinicio de orientación.
- Búsqueda y filtros por lugares, comercios y edificios; acceso al punto de partida.
- Fichas de punto de interés, edificio y comercio con coordenadas, distancias, datos de contacto y enlaces relacionados.
- Copia de coordenadas y apertura del punto en OpenStreetMap.
- Geolocalización con avisos cuando está denegada, no soportada o fuera del área.
- Selector de idioma y panel «Acerca de» con notas de cobertura y atribuciones.

**STUDIO**

- Herramientas select / mover / rotar / escala (V/M/R/E) y atajos: `Ctrl+D` duplica, `Supr` elimina, `Ctrl+S` guarda, `Ctrl+Z`/`Ctrl+Y` deshacen y rehacen, `Escape` limpia la selección.
- Biblioteca de modelos, con importación de GLB, miniatura generada al importar y detección de duplicados por hash.
- Edición de nombre, descripción, categoría, icono, visibilidad, posición y otros campos de lugares y comercios.
- Ajuste de dimensiones y colores de los modelos, sustitución de modelo y alineación con vías.
- Guardado automático, guardado manual con resultado real (`saveNow()`), importación/exportación de JSON y restauración del documento original. El indicador distingue entre cambios sin guardar, guardado y versión original.
- «Actualizar WORLD» genera `data/world.public.json` desde el documento actual con el mismo validador del build público y refresca `/` en desarrollo. Es independiente de Guardar: no toca el borrador privado ni despliega nada.
- Vista de USUARIO en `/usuario` con el documento actual y sus GLB, sin publicarlo ni reconstruir WORLD; incluye elementos no publicados.
- Duplicado de puntos y comercios desde la lista y la vista de edición; `Ctrl+D` duplica el elemento activo (entidad, punto o comercio). Las copias mantienen las variantes ES/PT-BR y los comercios copiados quedan como borrador.

## Idiomas

El sistema bilingüe es propio y no añade dependencias. El idioma activo se guarda en `localStorage` bajo la clave `tumeremo-world:lang`; el valor predeterminado y de reserva es el español. El selector está disponible en WORLD y en STUDIO, y el cambio se refleja de inmediato en textos, etiquetas, mensajes, títulos y metadatos de la página.

Las cadenas se organizan en catálogos tipados en `src/i18n/locales/`. Los nombres de formato, fechas, horas, números y distancias usan `Intl` con la configuración regional correspondiente. Los campos editables pueden conservar variantes `i18n.es` e `i18n.pt-BR`; si falta alguna, se usa el campo original como reserva. Los identificadores, códigos de categoría y nombres propios no se traducen.

## Datos y persistencia

El documento inicial contiene 14 puntos de interés, 8 edificios, 11 objetos y 4 comercios. Los datos semilla viven en `src/data/` y no se sobrescriben con los cambios del usuario: las ediciones se guardan como borrador local.

| Dato | Almacenamiento |
| --- | --- |
| Documento del mundo | `localStorage` → `tumeremo-world:document:v1` |
| Idioma | `localStorage` → `tumeremo-world:lang` |
| Tema visual del WORLD | `localStorage` → `tumeremo-world:theme` |
| Modelos GLB importados | IndexedDB → base de datos `tumeremo-world`, almacén `glb-models` |

La validación del documento normaliza la versión del esquema sin descartar contenido por diferencias de versión, conserva las variantes de idioma y reincorpora los puntos semilla que falten sin duplicar los existentes. La exportación de STUDIO genera un JSON con el documento y, cuando existen, los modelos GLB codificados en base64; la importación los reutiliza por hash o los registra con un identificador nuevo si hay conflicto.

### Recuperación y guardado

Si el borrador local está corrupto o no supera la validación, se conserva intacto en cuarentena y se crea una copia de seguridad antes de migrar; el autoguardado queda suspendido hasta que el usuario decida. Al reanudar, las copias se conservan y solo una restauración confirmada puede descartarlas. La validación repara entidades en lugar de eliminarlas y las bajas de puntos se registran para que la semilla no los reincorpore.

STUDIO no usa `window.confirm`: las bajas se confirman en la propia interfaz y las acciones sin botón visible (teclado, restaurar) usan un diálogo controlado. `saveNow()` devuelve si el guardado funcionó; si falla, los cambios siguen en memoria y se ofrece reintentar.

## SEO y rendimiento público

La marca pública de SEO y redes sociales es **Tumeremo Worlds**. La cadena histórica de la interfaz, `TUMEREMO WORLD`, se conserva y se registra como `alternateName` en los datos estructurados. No hay rediseño de la interfaz ni cambios en la escena 3D.

La URL canónica candidata es `https://tumeremo.com/`. Es solo un **candidato** hasta verificar el dominio personalizado o la ruta reales en Cloudflare: en este trabajo no se hicieron cambios de DNS ni de dominio. `PUBLIC_SITE_URL` la reemplaza en tiempo de build; el build público usa el candidato por defecto. STUDIO sigue requiriendo `VITE_PUBLIC_WORLD_URL` con la URL pública real. Cloudflare canonicaliza `/index.html` a `/` y la etiqueta canonical apunta siempre a `/`.

El build público incorpora `robots.txt`, `sitemap.xml`, `favicon.svg`, `favicon.png`, `og-image.png` y `404.html`. `wrangler.jsonc` sigue siendo *assets-only* y añade `assets.not_found_handling = "404-page"`: las rutas públicas desconocidas devuelven la página 404 real, nunca `index.html`, y no hay fallback SPA. Los archivos SEO se copian solo a `dist-public`; `vite.studio.config.ts` define `publicDir: false`, por lo que `dist-studio` sigue siendo exactamente `studio.html` + `_headers` + `_redirects`. STUDIO y USUARIO mantienen `noindex` en metadatos y `X-Robots-Tag: noindex,nofollow`; el host privado sigue necesitando Cloudflare Access (no configurable desde el repositorio).

Los datos estructurados se limitan a `WebSite`, `WebApplication`, `WebPage` y `Place` (Tumeremo, Municipio Sifontes, Bolívar, Venezuela). No se publican `LocalBusiness`, `Review` ni valoraciones para los comercios actuales: todos los comercios públicos publicados tienen `origin: "demo"` y NAP vacío. Las futuras fichas de entidades exigirán una lista de permitidos pública y explícita con `origin != demo`, `published`, `visible`, `seoIndex` y `schemaEligible`, NAP/geo/contacto verificados, slug estable y procedencia. No se infieren negocios reales a partir de etiquetas de categoría ni de datos de demostración; la cobertura de teselas del mapa no se usa como área de servicio de un negocio.

El build público inyecta solo los modelos GLB personalizados referenciados por `data/world.public.json.document`; `data/world.public.json` y `scripts/prepare-public-world.mjs` no cambian. El GLB sin usar de 9,18 MB (base64 ~12,24 MB) que antes se inyectaba deja de descargarse y decodificarse. Las definiciones de modelos *builtin* y el comportamiento 3D no se tocan.

### Verificación

```bash
VITE_PUBLIC_WORLD_URL='https://tumeremo.com/' PUBLIC_SITE_URL='https://tumeremo.com/' npm run check:all
npm run verify:world -- --bundle dist-public/index.html
npm run verify:seo
npm run verify:wrangler
```

`scripts/verify-seo.mjs` comprueba metadatos, canonical, OG/Twitter, JSON-LD, robots, sitemap, favicon/imagen OG, 404 y el `noindex` privado; `check:all` lo incluye. `deploy:public` exige `PUBLIC_SITE_URL` y encadena `verify:wrangler` y `verify:seo` antes de desplegar; el rollback se mantiene promoviendo una versión anterior del Worker. Siguen pendientes de Google la inspección de URL en Search Console, el envío del sitemap, la Rich Results Test y los datos de campo de Core Web Vitals. No se afirma que Google haya indexado el sitio.

## Tecnologías

- React 19 y TypeScript 5.9
- Vite 7 y `vite-plugin-singlefile`
- Tailwind CSS 4
- MapLibre GL JS 5
- Three.js 0.187
- Gestión de idioma y formatos propia, sin dependencias adicionales

### Aviso de `npm audit` en MapLibre GL JS

`npm audit` sigue marcando `maplibre-gl@5.24.1` como crítico por `CVE-2026-85061` / `GHSA-jrc7-96c5-q579`. El rango publicado (`<= 6.4.0`) no refleja el *backport* del parche incluido en `5.24.1` (2026-11-11), verificado en el bundle instalado. Se conserva la versión 5.24.1 y no se desactivan las alertas de auditoría. Detalles, evidencias y condiciones de revisión: [`docs/seguridad/maplibre-gl-audit.md`](docs/seguridad/maplibre-gl-audit.md).

## Requisitos

- Node.js `>=22.12.0`
- npm
- Navegador moderno con soporte WebGL
- Conexión a internet para cargar las teselas vectoriales y las fuentes de OpenFreeMap

## Instalación y ejecución

```bash
npm install
npm run dev
```

El servidor de desarrollo se inicia en `http://localhost:5175` y escucha en `0.0.0.0` (el puerto está fijado con `--strictPort`).

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Inicia el servidor de desarrollo. STUDIO privado en `/studio.html`. |
| `npm run prepare:world -- <export.json>` | Valida el export de STUDIO y genera `data/world.public.json`. |
| `npm run verify:world` | Verifica el mundo publicado (o informa del bloqueo si falta el export). |
| `PUBLIC_SITE_URL=<url> npm run build` / `npm run build:public` | Genera `dist-public`: WORLD de solo lectura, sin editor. `PUBLIC_SITE_URL` fija el canonical; por defecto se usa el candidato. |
| `VITE_PUBLIC_WORLD_URL=<url> npm run build:studio` | Genera `dist-studio/studio.html` + `_headers` + `_redirects`: STUDIO privado. La URL pública de «Abrir WORLD» es obligatoria. |
| `npm run verify:wrangler` | Comprueba que `wrangler.jsonc` publica solo `./dist-public`, con `not_found_handling = "404-page"`, y que no hay artefactos privados en el bundle. |
| `npm run verify:seo` | Verifica metadatos, canonical, OG/Twitter, JSON-LD, robots, sitemap, favicon/imagen OG, 404 y las protecciones `noindex` privadas. |
| `npm run check:all` | Typecheck + verificación del mundo + ambos builds + verificaciones de Wrangler y SEO. |
| `npm run typecheck` | Comprueba TypeScript sin emitir archivos. |
| `npm run preview -- --outDir dist-public` | Sirve localmente el artefacto público (usa `--outDir dist-studio` para STUDIO). |
| `PUBLIC_SITE_URL=<url> npm run deploy:public` | Exige `PUBLIC_SITE_URL`, ejecuta `build:public`, `verify:wrangler` y `verify:seo` antes de desplegar `dist-public/` como Worker `tumeremo-world`. Nunca llames a `wrangler deploy` directamente. |
| `npm run deploy:studio` | Despliega `dist-studio/` al proyecto Pages privado (requiere las variables de Cloudflare). |

## Rutas

| Ruta | Modo |
| --- | --- |
| `/` (desarrollo) | WORLD público de solo lectura, con el mismo documento congelado del build (`data/world.public.json`). |
| `/studio.html` (desarrollo/artefacto privado) | STUDIO privado: borrador local, export/import y herramientas. |
| `/usuario` (bundle privado) | Vista privada del mismo borrador y GLB de STUDIO, con elementos no publicados. |
| `#/item/<kind>/<id>` | Fragmento dentro de WORLD y de `/usuario`: selección compartible (restaura cámara). No es una ruta del servidor. |

No existen alias `#/studio`, `#editor`, `/studio` ni `/usuario/editor`. El artefacto público `dist-public/index.html` **no contiene STUDIO** ni importa el editor; las únicas cadenas `IndexedDB`/`TOKEN` detectadas proceden de catálogos i18n y de la especificación de MapLibre, no de las etiquetas SEO ni de credenciales. El WORLD se despliega como Worker de Cloudflare con Static Assets (`wrangler.jsonc` → `./dist-public`). Con `assets.not_found_handling = "404-page"`, las rutas desconocidas devuelven `404.html`, nunca `index.html`. El STUDIO se publica por separado en otro host, protegido por autenticación real en el borde (Cloudflare Access); consulta `cloudflare/README.md`.

> El build público falla a propósito si no existe `data/world.public.json`: nunca se generan datos vacíos ni se sustituye el mundo editado por la semilla.

## Estructura del proyecto

```text
src/
├── apps/
│   ├── studio/      Editor: pestañas, operaciones del documento y campos
│   └── world/       WORLD: búsqueda, fichas informativas y panel Acerca de
├── core/            Tipos, almacén, persistencia, validación y utilidades
├── data/            Datos semilla, biblioteca de modelos y modelos GLB
├── engine/          Motor de mapa, capa 3D y carga de modelos
├── geo/             Fuente geográfica, teselas y atribuciones
├── i18n/            Idioma, traducciones, formatos y campos localizados
├── ui/              Selector de idioma, iconos, avisos y enlace al motor
├── App.tsx          Router privado: STUDIO / USUARIO
├── main.tsx         Entrada de index.html
└── studio-main.tsx  Entrada de studio.html
index.html           Documento de entrada del WORLD
studio.html          Documento de entrada del STUDIO
vite.config.ts       Configuración de Vite y build de archivo único
```

## Atribuciones

El mapa utiliza teselas vectoriales de [OpenFreeMap](https://openfreemap.org) con datos de [OpenStreetMap](https://www.openstreetmap.org/copyright), © contribuidores de OpenStreetMap, disponibles bajo ODbL. La atribución se muestra también dentro de la aplicación.

## Licencia

No se ha definido una licencia en este proyecto. Su elección queda a criterio del autor antes de la publicación.
