# Despliegue en Cloudflare Pages

## Estado actual

**No hay configuración de Cloudflare versionada actualmente en este repositorio.** No existe un
`wrangler.toml` activo ni un proyecto/dominio creado por este repositorio.
`cloudflare/wrangler.pages.example.toml` es **solo una plantilla de ejemplo** con placeholders
(`<PROJECT_NAME>`, `<DIST_PUBLIC_OR_DIST_STUDIO>`); no se usa durante los builds ni los despliegues.
Los despliegues se hacen por *Direct Upload* con `npx wrangler pages deploy`.

La cuenta del usuario debe tener **DOS proyectos/hosts distintos**, creados o identificados desde
el dashboard de Cloudflare (el usuario decide los nombres):

1. **Público**: WORLD, sin Cloudflare Access.
2. **Privado**: STUDIO, protegido con Cloudflare Access.

## Por qué STUDIO necesita su propio host

`#/studio` es un *fragmento* del navegador: **no se envía al servidor**. Cloudflare (y por tanto
Cloudflare Access) solo ve la ruta real de la petición, que es `/`. No se puede proteger `#/studio`
con una regla de Access. Por eso Access debe proteger **una ruta o un host real**, p. ej. un host
dedicado de STUDIO (el usuario elige el nombre, por ejemplo `studio.<dominio>`), con una política
de Access sobre ese host. No publicar STUDIO en el mismo host público.

## Datos y secretos que debe proporcionar el usuario

No hay valores por defecto ni credenciales inventadas en el repositorio. El usuario debe indicar:

| Dato / secreto | Uso |
| --- | --- |
| Nombre del proyecto Pages público | `CF_PAGES_PROJECT_PUBLIC` |
| Nombre del proyecto Pages privado (STUDIO) y su host | `CF_PAGES_PROJECT_STUDIO` y la configuración del host en Cloudflare |
| Dominio(s) que se asociarán a cada proyecto | DNS / dominios personalizados en el dashboard |
| URL absoluta del WORLD público | `VITE_PUBLIC_WORLD_URL`, requerida por `build:studio` para «Abrir WORLD»; no se deriva del host de STUDIO |
| Permiso para crear/configurar una aplicación y política de **Cloudflare Access** sobre el host de STUDIO | Protección del editor |
| `CLOUDFLARE_ACCOUNT_ID` (ID de cuenta) | Wrangler necesita la cuenta destino |
| `CLOUDFLARE_API_TOKEN` con permiso **Pages:Edit** | Wrangler necesita subir los archivos |

El token y el ID de cuenta se entregan como variables de entorno de la sesión; **no se escriben en
archivos versionados**. Si se va a purgar caché por API, también se necesita el `ZONE_ID` del
dominio (o hacer la purga desde el dashboard).

## Comandos

El mundo publicado `data/world.public.json` se genera con el export real de STUDIO y debe estar
versionado antes de desplegar. Si falta o no coincide con el export, `verify:world` y
`build:public` fallan con un mensaje claro (no hay datos vacíos ni fallbacks).

```bash
npm run prepare:world -- <ruta-al-export-de-STUDIO.json>   # genera data/world.public.json
npm run check:all       # typecheck + verify:world + build:public + build:studio
export CLOUDFLARE_ACCOUNT_ID='<ID_DE_CUENTA>'
export CLOUDFLARE_API_TOKEN='<TOKEN_CON_PAGES_EDIT>'
export CF_PAGES_PROJECT_PUBLIC='<NOMBRE_PROYECTO_PUBLICO>'
export CF_PAGES_PROJECT_STUDIO='<NOMBRE_PROYECTO_STUDIO>'
export VITE_PUBLIC_WORLD_URL='https://<DOMINIO_PUBLICO>/'   # la usa build:studio
npm run build:studio    # falla si falta VITE_PUBLIC_WORLD_URL
npm run deploy:public   # sube dist-public/ al proyecto Pages público
npm run deploy:studio   # sube dist-studio/ al proyecto Pages privado
```

Cada build genera un único HTML autocontenido:

- `build:public` → `dist-public/index.html` (define inyectado con el documento y los modelos públicos).
- `build:studio` → `dist-studio/studio.html`, `_headers` (copiado desde `cloudflare/_headers.studio`) y `_redirects` (copiado desde `cloudflare/_redirects.studio`), que sirve `/usuario` con el HTML privado.

`_headers` envía `Cache-Control: no-store` y cabeceras de endurecimiento para STUDIO; **no**
sustituye a la política de Access, que se configura en el dashboard sobre el host real.
El despliegue usa siempre `--branch=main`.

## Rollback y caché

- **Rollback**: en el dashboard de Cloudflare Pages, abrir el proyecto afectado → *Deployments* →
  seleccionar un despliegue anterior → *Rollback* / promoverlo a producción. Hacerlo por separado
  en el proyecto público y en el de STUDIO.
- **Purga de caché**: si tras un despliegue o rollback se sigue sirviendo HTML antiguo, en el
  dashboard de Cloudflare usar *Caching → Configuration → Purge Everything* para la zona del
  dominio afectado (o purgar solo la URL concreta). Alternativamente, usar la API de purga de
  caché con `CLOUDFLARE_API_TOKEN` y el `ZONE_ID` del dominio. El host de STUDIO debe devolver
  `no-store`, pero la purga puede ser necesaria para el contenido ya cacheado.
