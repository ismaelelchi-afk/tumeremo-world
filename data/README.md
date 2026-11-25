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
