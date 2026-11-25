# Fixtures: SOLO pruebas

Todo archivo que se coloque en esta carpeta es **exclusivamente de pruebas**. Nunca es fuente de producción:

- no se usa para generar `data/world.public.json`;
- no se copia a `dist-public/` ni a `dist-studio/`;
- no sustituye al JSON exportado desde STUDIO;
- no se usa para rellenar, reconstruir ni "arreglar" entidades del mundo.

La única fuente de producción es el JSON que exporta el navegador desde STUDIO en el mismo origen (`http://localhost:5175`): menú → **Exportar JSON**. Ese export se transforma con `npm run prepare:world -- <archivo-exportado.json>` y se valida con `npm run verify:world`.

Este repositorio **no incluye** ese export. Por eso `scripts/verify-world.mjs` imprime `BLOQUEADO` y termina con código `2` mientras no exista `data/world.public.json`. No se inventan datos para evitar el bloqueo.

## Regla para añadir fixtures

No añadas fixtures con datos inventados. Si una prueba necesita una entrada mínima, crea el archivo más pequeño posible dentro de esta carpeta y márcalo explícitamente como sintético, por ejemplo:

- nombre: `synthetic-minimal.example.json`;
- primera clave o comentario legible del contenido: `"_testOnly": "SYNTHETIC / TEST ONLY — no es un export real"`;
- úsalo únicamente desde la prueba, nunca desde `scripts/prepare-public-world.mjs`, configuraciones de Vite ni código de `src/**`.

No nombres ese archivo `world.public.json` ni lo copies a `data/`: ese nombre está reservado para el artefacto generado a partir del export real del navegador.

Los scripts `verify-world.mjs` y `verify-bundle.mjs` no leen esta carpeta; no sirve como atajo para pasar las verificaciones.
