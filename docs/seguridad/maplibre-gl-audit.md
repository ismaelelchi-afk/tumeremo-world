# `npm audit`: falso positivo en `maplibre-gl@5.24.1`

> Documentado el 2026-11-25. No se han modificado dependencias, código de la aplicación ni configuración de auditoría. No se ha desplegado, commiteado ni pusheado.

## Resumen

`npm audit` informa de **1 vulnerabilidad crítica** en `maplibre-gl@5.24.1` (`CVE-2026-85061` / `GHSA-jrc7-96c5-q579`). El aviso es auténtico, pero su rango semver no fue actualizado cuando el proyecto publicó el *backport* del parche en la rama 5.x. **La versión instalada ya contiene el arreglo**, por lo que el hallazgo es un falso positivo para este proyecto. Se conserva `5.24.1` y **no se suprime globalmente** `npm audit`.

## 1. Aviso y versión afectada según la base de datos

| Campo | Valor |
| --- | --- |
| CVE | `CVE-2026-85061` |
| GHSA | `GHSA-jrc7-96c5-q579` |
| Título | *MapLibre GL JS: XSS Sanitizer Bypass in `DOM.sanitize()` via Live NamedNodeMap Removal Skip* |
| Publicación del aviso | 2026-09-08 |
| Severidad | Critical · CVSS 3.1 `10.0` · `AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:N` |
| CWE | `CWE-79` (Improper Neutralization of Input During Web Page Generation) |
| Rango vulnerable (GitHub/OSV) | `<= 6.4.0` — introducido en `0`, primer arreglo declarado `6.4.1` |
| Salida de `npm audit --json` | `range: "<=6.4.0"`, `nodes: ["node_modules/maplibre-gl"]`, `fixAvailable: { version: "6.19.0", isSemVerMajor: true }` |

Fuentes: <https://github.com/advisories/GHSA-jrc7-96c5-q579>, <https://api.osv.dev/v1/vulns/GHSA-jrc7-96c5-q579> y el PR del fix <https://github.com/maplibre/maplibre-gl-js/pull/8189>.

`npm audit` propone `6.19.0` porque es la versión estable más reciente fuera del rango, no porque `5.24.1` siga sin parche.

## 2. Backport del parche incluido en `maplibre-gl@5.24.1`

- `6.4.1` se publicó el **2026-08-18**.
- `5.24.1` se publicó el **2026-11-11**, después del aviso y del parche en `6.x`.
- Las notas de la release `v5.24.1` incluyen explícitamente:
  - *Fix `DOM.sanitize` leaving dangerous attributes behind when multiple consecutive attributes are present* (#8189) — **el fix de este CVE**.
  - *Fix DOM sanitization for `iframe` and `srcdoc`* (#8396).
  - *Insert sanitized attribution HTML as DOM nodes instead of re-parsing a serialized string* (#8528).
  - *Sanitize attribution with an allow list of tags and attributes rather than a list of known-dangerous ones* (#8532).
  - *Fix an unclosed disallowed tag in one attribution erasing the other attributions* (#8571).

El PR `#8189` describe la causa: iterar la `NamedNodeMap` **viva** de `elem.attributes` mientras se eliminan atributos omitía el atributo siguiente; con dos atributos peligrosos consecutivos, el segundo sobrevivía al sanitizador. El arreglo toma una instantánea (`Array.from(elem.attributes)`) antes de iterar y añade pruebas de regresión. El exploit demostrado pasaba por cadenas de atribución no confiables en el control de atribuciones.

**Conclusión:** la base de datos de avisos conserva `<= 6.4.0` como último rango afectado conocido y no registró el *backport* en 5.x. Por eso `npm audit` marca una versión que ya está corregida.

## 3. Evidencias verificadas en el bundle instalado

Comprobaciones de solo lectura sobre el artefacto instalado (no sobre el código fuente de release):

| Evidencia | Resultado |
| --- | --- |
| `node -p "require('./node_modules/maplibre-gl/package.json').version"` | `5.24.1` |
| `node_modules/maplibre-gl/dist/maplibre-gl.js` contiene `static sanitize(e){const t=(new DOMParser)` | ✅ |
| El sanitizador usa `getAttributeNames()` como instantánea y lee métodos desde el prototipo (`f()`) | ✅ |
| `removeDisallowedAttributes` itera `for(const a of t.call(e))` y elimina con `removeAttribute` | ✅ |
| Validación de `href`/`src` mediante `new URL(valor, "https://maplibre.invalid/")` y lista de protocolos permitidos | ✅ |
| El control de atribuciones aplica `g.sanitize(o)` a **cada** atribución antes de unirlas con `" | "` | ✅ |
| `src/util/dom.ts` en el tag `v5.24.1` coincide con el bundle (`DOMParser`, `getElementInternals()`, allow-list) | ✅ |

Comandos reproducibles:

```bash
node -p "require('./node_modules/maplibre-gl/package.json').version"
node -e "const s=require('node:fs').readFileSync('node_modules/maplibre-gl/dist/maplibre-gl.js','utf8'); console.log(/static sanitize\\(e\\)\\{const t=\\(new DOMParser\\)/.test(s), s.includes('getAttributeNames'), s.includes('maplibre.invalid'))"
curl -fsSL https://api.github.com/advisories/GHSA-jrc7-96c5-q579
curl -fsSL https://api.github.com/repos/maplibre/maplibre-gl-js/releases/tags/v5.24.1
npm view maplibre-gl time --json
```

## 4. Motivo para conservar `5.24.1`

1. **Ya incluye el parche** y endurecimientos adicionales del sanitizador; no hay beneficio de seguridad al migrar a `6.19.0` por este aviso.
2. **Superficie de explotación limitada en Tumeremo Worlds**: el único uso relevante es `AttributionControl` en `src/engine/WorldEngine.ts`. No hay `Popup.setHTML`, `setDOMContent`, `innerHTML` alimentado por datos externos ni atribuciones introducidas por el usuario.
3. **Datos de atribución actuales**: cadena estática y local en `src/geo/geography.ts` y TileJSON remoto de OpenFreeMap, verificado con atribución benigna de OpenFreeMap / OpenMapTiles / OpenStreetMap.
4. **Migración a v6 con riesgo innecesario**: ESM-only (hay que cambiar los imports por defecto de `WorldEngine.ts` y `ThreeLayer.ts`), `setWorkerUrl()` obligatorio con Vite, WebGL2 obligatorio, cambio del valor por defecto de `zoomLevelsToOverscale` que afecta al renderizado y a `queryRenderedFeatures`, eventos como clases y `styleimagemissing` distinto.
5. **No se aplica ninguna supresión**: no existe `.npmrc` en el repositorio, `npm config get audit` devuelve `true` y `npm audit` sigue terminando con el hallazgo visible. Esta nota explica el hallazgo; no lo oculta.

### Coherencia con el proyecto

| Archivo | Valor verificado |
| --- | --- |
| `package.json` → `dependencies` | `"maplibre-gl": "^5.24.1"` |
| `package-lock.json` → paquete raíz | `"maplibre-gl": "^5.24.1"` |
| `package-lock.json` → `node_modules/maplibre-gl` | `"version": "5.24.1"`, tarball `maplibre-gl-5.24.1.tgz`, integridad `sha512-HyiYBwtsbk3L1n1EPLJHWqdoyMiF80n7tEYXFZyu2m1TjvaNx6KMLiFeDdmszt1/mq2zvsR1TJuX/NMu5BonXQ==` |
| `npm ls maplibre-gl --depth=0` | `tumeremo-world@1.0.0 → maplibre-gl@5.24.1` |

El operador `^` permite futuras versiones `5.x`, pero **no** salta a `6.x`; la versión efectiva hoy está fijada por el lockfile.

## 5. Condiciones que obligarían a revisar esta decisión

- Que GitHub/OSV o `npm audit` actualicen el rango para excluir explícitamente `5.24.1`: entonces se vuelve a ejecutar `npm audit` y se cierra el falso positivo con evidencia oficial.
- Que aparezca un aviso nuevo que afecte a `5.24.1`, a sus dependencias transitivas o al propio control de atribuciones.
- Que el lockfile resuelva una versión distinta de `5.24.1` (incluida otra `5.x`): hay que repetir la comprobación del bundle y de las notas de release antes de aceptarla.
- Que la aplicación pase a aceptar estilos, atribuciones o HTML no confiables (por ejemplo `Popup.setHTML`, `setDOMContent`, un editor de estilos remoto o contenido de una API externa): el riesgo real dejaría de ser bajo.
- Que el proveedor de teselas cambie o su TileJSON pase a devolver atribuciones no confiables.
- Que se decida migrar a MapLibre v6 por otros motivos: aplicar la guía `v5 → v6` y ejecutar las pruebas funcionales/visuales completas.
- Que una política de seguridad exija `npm audit` sin hallazgos: evaluar una excepción **documentada y limitada a este aviso** o una migración probada. En ningún caso desactivar `npm audit` de forma global (`audit=false`, `--omit`, etc.).

## 6. Estado de esta documentación

Cambio exclusivamente documental: este archivo y un enlace breve desde `README.md`, más la corrección de la línea de requisitos de Node para que coincida con `engines.node` de `package.json` (`>=22.12.0`). No se ejecutó deploy, commit ni push; no se tocaron dependencias ni `src/`.
