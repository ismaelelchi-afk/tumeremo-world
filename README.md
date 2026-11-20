# Tumeremo World

Plataforma digital bilingüe (español y portugués brasileño) de Tumeremo, Venezuela. Un mismo proyecto reúne dos experiencias que comparten el motor, el documento de datos y el sistema de idiomas:

- **WORLD**: la vista pública para explorar el territorio.
- **STUDIO**: el editor para construir y mantener ese territorio.

El mapa base procede de datos abiertos de OpenStreetMap servidos por OpenFreeMap. No se necesitan claves de API ni credenciales para ejecutar la aplicación.

## Experiencias

### WORLD

Vista de consulta del mundo digital: mapa real en 2D o 3D, edificios y objetos ubicados en el territorio, puntos de interés y comercios. Incluye búsqueda con filtros, fichas informativas, temas día/noche, geolocalización y panel de atribuciones. El WORLD muestra únicamente el contenido publicado y visible; el estado del documento (original o borrador) se indica en la cabecera cuando existe un borrador local.

### STUDIO

Editor territorial con vista previa del WORLD mediante el mismo documento. Organiza el trabajo en cinco áreas: biblioteca de modelos, escena, puntos, comercios y propiedades. Dispone de herramientas de selección, movimiento, rotación y escalado, alineación de edificios con la vía más cercana, duplicado, eliminación, control de visibilidad y edición de parámetros de cada modelo. También permite gestionar los 14 puntos de interés y sus comercios asociados, deshacer y rehacer cambios, guardar automáticamente en el navegador, importar y exportar el documento en JSON y restaurar el estado original.

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

- Herramientas select / mover / rotar / escala y atajos de teclado para cambiar de herramienta, duplicar, eliminar y deshacer/rehacer.
- Biblioteca de modelos, con importación de GLB, miniatura generada al importar y detección de duplicados por hash.
- Edición de nombre, descripción, categoría, icono, visibilidad, posición y otros campos de lugares y comercios.
- Ajuste de dimensiones y colores de los modelos, sustitución de modelo y alineación con vías.
- Guardado automático, guardado manual, importación/exportación de JSON y restauración del documento original.
- Vista previa del WORLD con el documento actual, sin publicarlo.

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

## Tecnologías

- React 19 y TypeScript 5.9
- Vite 7 y `vite-plugin-singlefile`
- Tailwind CSS 4
- MapLibre GL JS 5
- Three.js 0.187
- Gestión de idioma y formatos propia, sin dependencias adicionales

## Requisitos

- Node.js `^20.19.0 || >=22.12.0`
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
| `npm run dev` | Inicia el servidor de desarrollo. |
| `npm run build` | Genera el build de producción en `dist/`. |
| `npm run preview` | Sirve localmente el contenido de `dist/`. |
| `npm run typecheck` | Comprueba TypeScript sin emitir archivos. |
| `npm run check` | Ejecuta la comprobación de tipos y el build. |

## Rutas

| Ruta | Modo |
| --- | --- |
| `/` | WORLD |
| `/studio.html` | STUDIO (servidor de desarrollo) |
| `/#/studio` | STUDIO (build de archivo único) |

El build de producción genera un único `dist/index.html` que contiene ambas experiencias. El modo se decide por la ruta o por el fragmento `#/studio`.

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
├── App.tsx          Detección del modo WORLD / STUDIO
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
