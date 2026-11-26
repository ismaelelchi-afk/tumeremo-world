# Datos públicos del mundo

`data/world.public.json` es un archivo **GENERADO** por `scripts/prepare-public-world.mjs` a partir del JSON que exporta STUDIO (`tumeremo-world-YYYYMMDD-HHMM.json`, con `customModels` y los GLB en base64). **Debe versionarse** para que la app pública pueda consumirlo. **NUNCA debe crearse ni reconstruirse desde `src/data/seed.json`**: la semilla no contiene los modelos ni los cambios hechos en STUDIO.

## Comandos

Generar (falla si el archivo ya existe):

```sh
node scripts/prepare-public-world.mjs ruta/al/tumeremo-world-YYYYMMDD-HHMM.json
```

Validar sin escribir nada:

```sh
node scripts/prepare-public-world.mjs --check ruta/al/tumeremo-world-YYYYMMDD-HHMM.json
```

Reemplazar un archivo ya existente (solo de forma explícita):

```sh
node scripts/prepare-public-world.mjs --force ruta/al/tumeremo-world-YYYYMMDD-HHMM.json
```

Si `data/world.public.json` existe y no se pasa `--force`, el script aborta e imprime el SHA-256 del archivo existente. La escritura es atómica (`.tmp` + `rename`).

## Formato generado

```text
{
  schemaVersion: 1,                 // literal
  generatedAt: ISO-8601,
  source: { file: basename, sha256: SHA-256 del export original },
  counts: { buildings, objects, businesses, places, models },
  modelIds: [...]                   // IDs de modelo usados por buildings/objects
  document: { ...WorldDocument },   // idéntico al export, SIN la clave customModels
  models: [ ...CustomModelBundle ]  // tal cual en el export
}
```

El script valida antes de escribir: esquema y arrays, IDs únicos (sin colisiones entre colecciones ni referencias `buildingId` rotas), posiciones/parámetros finitos, resolución de `modelId` contra `model-ids.json` o los bundles, integridad de cada GLB (base64 canónico, `size`, hash SHA-256 de 64 hex, cabecera GLB 2.0, chunks coherentes y **sin URIs externas**), y conservación literal de `animation`, `removedPlaceIds` y de todas las claves `*Migration` presentes en el export. No genera banderas ausentes y **no filtra** entidades por `published` ni por `visible`. `verify-world.mjs` aplica la misma comprobación de GLB al archivo publicado.

## SEO y datos estructurados

Los datos estructurados del WORLD se limitan a `WebSite`, `WebApplication`, `WebPage` y `Place` (Tumeremo, Municipio Sifontes, Bolívar, Venezuela). No se generan `LocalBusiness`, `Review` ni valoraciones para los comercios actuales: todos los comercios públicos publicados tienen `origin: "demo"` y NAP vacío. La marca pública de SEO/social es «Tumeremo Worlds»; «TUMEREMO WORLD» se conserva como `alternateName`.

Una futura ficha de entidad con SEO/schema solo podrá incorporarse mediante una lista de permitidos pública y explícita: `origin != demo`, `published`, `visible`, `seoIndex` y `schemaEligible`, NAP/geo/contacto verificados, slug estable y procedencia. No se infieren negocios reales a partir de etiquetas de categoría ni de datos de demostración; la cobertura de teselas del mapa no define el área de servicio de un negocio. Estas comprobaciones no modifican `world.public.json` ni su validador.

## Proyección de modelos en el build público

El build público inyecta solo los modelos GLB personalizados referenciados por `data/world.public.json.document`. `data/world.public.json` y `scripts/prepare-public-world.mjs` no cambian: siguen conservando bundles y entidades sin filtrar por `published` ni por `visible`. El GLB sin usar de 9,18 MB (base64 ~12,24 MB) que antes se inyectaba deja de descargarse y decodificarse. Las definiciones de modelos *builtin* y el comportamiento 3D permanecen intactos.
