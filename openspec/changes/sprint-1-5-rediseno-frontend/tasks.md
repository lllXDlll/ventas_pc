# Tasks

## 0. Preparación y validación de R2

- [x] 0.1 Activar R2 en la cuenta de Cloudflare (lo hace el desarrollador) y crear el bucket con `npx wrangler r2 bucket create xdtech-imagenes`. Se verifica con `wrangler r2 bucket list`, que muestra el bucket (creado el 2026-11-11). El permiso de R2 del token de la CI se comprueba en el primer despliegue con el binding (tarea 3.1)
- [x] 0.2 Validar R2 desde el Worker de producción (design D9, spec `validacion-plataforma`): escritura, lectura y borrado de un objeto de 2 MB, y CPU de la subida medida con `wrangler tail`. Hacerlo con un endpoint temporal protegido por `@Roles('ADMIN')` que se quita en la misma tarea. Se verifica con el registro OK, o con el plan B, en `docs/compatibilidad-cloudflare.md`
- [x] 0.3 Revisar las versiones de Next, React y Tailwind y leer en `apps/web/node_modules/next/dist/docs/` las guías que aplican: fuentes, grupos de rutas, `metadata` con `robots` y componentes de cliente y servidor. Anotar en design.md cualquier diferencia con D1 a D4. Se verifica con la nota agregada, o con la indicación "sin diferencias", en design.md

## 1. API: esquema y semillas

- [x] 1.1 Migración `productos_marca_imagen` con `marca text NULL` e `imagen_clave text NULL` y sus campos en `schema.prisma`, seguida de `prisma generate` (design D8 y D9). Se verifica con `prisma migrate dev` en local y con una prueba de integración que aplica la migración sobre el catálogo del Sprint 1 y conserva los productos
- [x] 1.2 Marcas en `CATALOGO_EJEMPLO`, con al menos dos marcas de procesador, y la semilla `catalogo` completando la marca de los productos existentes sin duplicarlos. Se verifica con `semillas.int` ampliada: dos ejecuciones, el mismo conteo y todos los productos con marca

## 2. API: catálogo ampliado

- [x] 2.1 `marca` obligatoria en `CrearProductoDto` (de 1 a 60 caracteres, sin espacios en los extremos) y opcional en `ActualizarProductoDto`; `marca` e `imagenUrl` en las respuestas pública y administrativa. Se verifica con pruebas de integración: alta con marca, 400 sin marca y cambio de marca visible en `GET /productos/:id`
- [x] 2.2 Filtros `marca` (una o varias), `socket`, `q` y `orden` en `GET /productos`, con `id` como desempate (design D6). Se verifica con pruebas de integración de cada escenario de "Catálogo público filtrable y paginado", incluidos el 400 por `orden` inválido y el total igual con distinto orden
- [x] 2.3 `GET /facetas` con `categoria` opcional (design D7). Se verifica con pruebas de integración: marcas y sockets con su cantidad, rango de precio, y la marca que desaparece al agotarse su único producto
- [x] 2.4 `q` y `categoria` en `GET /admin/productos`. Se verifica con una prueba de integración que encuentra un producto inactivo por su nombre
- [x] 2.5 Medir con `wrangler tail` en producción, ya desplegado, la CPU de `GET /productos` con filtros y de `GET /facetas`, y registrarla en `docs/compatibilidad-cloudflare.md`. Se verifica con la tabla de medianas agregada

## 3. API: imágenes de producto

- [x] 3.1 Binding `IMAGENES` en `wrangler.jsonc` (producción y local) y su tipo en `worker-configuration.d.ts`. Se verifica con `pnpm --filter api typecheck`, con `wrangler dev` arrancando con el binding y con el job `desplegar` de la CI en verde, que confirma que el token tiene permiso de R2; si falla por permisos, se agrega "Workers R2 Storage: Edit" al token
- [x] 3.2 Detección del tipo por bytes iniciales (JPEG, PNG y WebP). Se verifica con pruebas unitarias de cada tipo, de un archivo de texto y de un archivo vacío
- [x] 3.3 `PUT /admin/productos/:id/imagen`, con cuerpo crudo de hasta 2 MB, clave nueva por subida, orden put, `UPDATE` y borrado de la anterior, y limpieza si falla el `UPDATE` (design D9); 413 `IMAGEN_DEMASIADO_GRANDE` en `filtro-errores` y 415 `TIPO_NO_ADMITIDO`. Se verifica con pruebas de integración: subida válida, reemplazo que borra el objeto anterior, 413, 415 con un `Content-Type` falso, 401 y 403, y stock y versión intactos
- [x] 3.4 `DELETE /admin/productos/:id/imagen` (204) y `GET /productos/:id/imagen/:archivo`, con `Content-Type`, `ETag` y `Cache-Control` inmutable, y 404 para un producto inactivo o un archivo que no coincide. Se verifica con pruebas de integración de cada caso y con `rutas-admin.e2e`, que incluye la ruta nueva

## 4. Frontend: base del sistema de diseño

- [x] 4.1 Instalar Tailwind CSS v4 (`@tailwindcss/postcss`), shadcn/ui (inicialización para Tailwind v4 y React 19), lucide-react, react-hook-form, zod, `@hookform/resolvers` y `@tanstack/react-query`, respetando la antigüedad mínima de pnpm, y configurar el alias `@/` en `tsconfig.json`. Se verifica con `pnpm --filter web build` y `typecheck` en verde
- [x] 4.2 `styles/tokens.css` con todos los tokens, el degradado, los radios y la sombra de hover, y `globals.css` con `@theme inline` y las variables de shadcn apuntando a los tokens, sin colores `oklch` sueltos (design D3). Se verifica con una página que usa `bg-bg`, `text-text` y `bg-primary` y se ve con los colores del documento
- [x] 4.3 `scripts/sin-colores-sueltos.mjs`, incluido en `pnpm lint`, y las reglas de capas con `no-restricted-imports` en `eslint.config.mjs` (design D2). Se verifica agregando a propósito un `#FF0000` en un `.tsx` y un import de `@/features` en `components/ui`: los dos hacen fallar `pnpm lint`, y después se quitan
- [x] 4.4 Inter y Space Grotesk con `next/font/google` como `--font-sans` y `--font-display`; `lib/format.ts` con `formatoPrecio` (`es-PE`, PEN) y `formatoStock`. Se verifica con `/dev/ui`, que muestra `S/ 1,299.00` en Space Grotesk
- [x] 4.5 Componentes base en `components/ui`:
  - Button, con las variantes primario, secundario, fantasma y degradado;
  - Input, Badge (éxito, advertencia, peligro, IA), Card, Skeleton, Dialog y FormField;
  - todos con foco visible.
  Se verifica con `pnpm lint` y con la vitrina de 4.6
- [x] 4.6 Ruta `/dev/ui` con todos los componentes, sus variantes y los estados deshabilitado, carga y error, y `robots: noindex`. Se verifica abriendo `/dev/ui` y con una prueba de Playwright que comprueba el `noindex`

## 5. Frontend: reestructuración por capas (sin cambios visuales)

- [x] 5.1 Mover el código a `app/(tienda)`, `app/(auth)` y `app/admin`, `features/{catalogo,auth,admin}` y `lib/` (design D1), sin cambiar las URL. `lib/api.ts` pasa a `lib/api-client.ts` sin "token", y `lib/atributos.ts` se conserva y se actualiza la ruta de su prueba de sincronización en la API. Va en un commit aislado. Se verifica con `pnpm lint`, `typecheck`, la prueba de sincronización de atributos y Playwright en verde antes de seguir
- [x] 5.2 `app/providers.tsx` con `QueryClient`; los hooks `useProductos`, `useProducto`, `useFacetas` y `useSesion` (`['me']`), y la precarga en el servidor con `HydrationBoundary` en el inicio, el catálogo y el detalle (design D4). Se verifica con el HTML de `/catalogo` servido con los productos (`curl` sin JavaScript) y con las `@humo` en verde

## 6. Frontend: shell global

- [x] 6.1 TopBar con el mensaje rotativo; Header fijo con el logo "XDTech" (texto con degradado), SearchBar que navega a `/catalogo?q=`, "Mi cuenta" con los nombres accesibles actuales y el carrito "disponible pronto" (design D10). Se verifica con la prueba de búsqueda desde la cabecera y con las pruebas de `cuenta` en verde
- [x] 6.2 MegaMenu con las 8 categorías, sus iconos y la columna de marcas de `GET /facetas`, accesible con teclado. Se verifica con la prueba de teclado: Enter abre, Tab recorre y Esc cierra con el foco de vuelta
- [x] 6.3 QuickLinks (Armador IA, Arma tu PC y Ofertas como "Disponible pronto"; Equipos armados con el filtro aplicado) y Footer en 4 columnas con los distintivos de confianza. Se verifica abriendo el inicio y con la prueba de que los accesos de sprints futuros no hacen peticiones
- [x] 6.4 MobileDrawer con foco atrapado y buscador desplegable en móvil. Se verifica con la prueba de teclado del menú lateral y con la de desbordamiento a 360 px

## 7. Frontend: catálogo

- [x] 7.1 Componentes de presentación ProductCard (recuadro claro 1:1 con imagen o icono, nombre con `line-clamp-2`, hasta 3 chips, precio y botón), StockBadge, SpecsTable y ProductGrid, solo con props. Se verifica en `/dev/ui` con un producto con imagen, uno sin imagen y uno con 3 unidades
- [x] 7.2 Inicio con Hero (degradado y los botones "Arma tu PC con IA" y "Ver catálogo"), CategoryGrid, 8 destacados y TrustBar. Se verifica abriendo `/` en 360, 768 y 1280 px
- [x] 7.3 Listado con breadcrumbs, FiltrosSidebar (categoría y precio con "Filtrar"; marcas y sockets desde las facetas), FilterChips, SortSelect, la búsqueda y Pagination, con el estado en la URL (design D5). Se verifica con las pruebas actuales de filtros y con la nueva de la marca en la URL tras recargar
- [x] 7.4 Detalle con ProductGallery (imagen o icono), precio, StockBadge, SpecsTable desde los atributos y los botones "Disponible pronto". Se verifica con la prueba actual del producto agotado (`Agotado` y la celda `LGA1700`) y con la de "Añadir al carrito" sin peticiones
- [x] 7.5 Estados de carga (Skeleton), vacío (con "Limpiar filtros") y error (con "Reintentar") en el inicio, el listado y el detalle. Se verifica con una prueba de Playwright de filtros sin resultados y otra con la API interceptada respondiendo 500

## 8. Frontend: cuenta

- [x] 8.1 AuthCard, y los formularios de inicio de sesión y registro con react-hook-form y zod (correo válido, contraseña de 8 a 128 caracteres), con errores en línea y el mensaje de la API. Se verifica con las pruebas actuales de `cuenta` y con una nueva de validación en línea que no envía el formulario
- [x] 8.2 `/recuperar`, que solo muestra "Disponible pronto" y un enlace para volver, enlazado desde el inicio de sesión como "¿Olvidaste tu contraseña?". Se verifica con una prueba de Playwright: la página no tiene campos y no hace peticiones a la API

## 9. Frontend: panel administrativo

- [x] 9.1 AdminShell con barra lateral y DataTable de productos con búsqueda y filtro por categoría (de `GET /admin/productos`), y acciones por fila. Se verifica con las pruebas actuales del panel (el cliente sin acceso y el administrador con la tabla) y con una de búsqueda
- [x] 9.2 ProductoForm con marca y AtributosFields según la categoría, y StockEditor en línea con el aviso de conflicto (rol `status`). Se verifica con las pruebas actuales de alta, de los campos por categoría y del conflicto de versión
- [x] 9.3 Subida, vista previa y borrado de la imagen en el formulario, con los mensajes de 413 y 415. Se verifica con una prueba de Playwright que sube `tests/e2e/archivos/producto.png` y luego la ve en el detalle público

## 10. Pruebas y QA

- [x] 10.1 `@axe-core/playwright` y una prueba sin infracciones `serious` ni `critical` en las 7 pantallas (inicio, listado, detalle, inicio de sesión, registro, `/recuperar` y panel). Se verifica con `pnpm test:e2e` en verde local y en la CI
- [ ] 10.2 Prueba de desbordamiento a 360 px en las 7 pantallas y revisión manual en 768 y 1280 px. Se verifica con la prueba en verde y con capturas adjuntas al registro de 10.4
- [x] 10.3 Comprobar que los productos sin disponible siguen sin aparecer como disponibles en el inicio, el listado y las facetas. Se verifica con las pruebas de integración y de Playwright existentes y con las de 2.3
- [ ] 10.4 Lighthouse móvil en `https://xdtech.store/catalogo` (accesibilidad ≥ 90 y rendimiento ≥ 80), registrado en `docs/compatibilidad-cloudflare.md`. Se verifica con la puntuación registrada y, si no llega, con la causa y la corrección aplicada
- [ ] 10.5 CI completa en verde (`verificar`, `e2e` y `desplegar`) y `@humo` contra producción. Se verifica con la ejecución de la CI del último commit y con `E2E_URL=https://xdtech.store pnpm test:e2e --grep @humo`

## 11. Documentación

- [x] 11.1 Reescribir `docs/Sprint 1.5 Rediseño del frontend.md` donde ya no aplica: la ampliación de la API (marca, filtros, facetas e imágenes en R2), `/recuperar` como "Disponible pronto", la sesión por cookie en lugar de "token", las rutas conservadas (`catalogo/[id]`), la ruta de `formatoPrecio` y el criterio de colores ampliado a `.ts` y `.css`. Se verifica con una lectura del documento sin contradicciones con design.md
- [x] 11.2 Actualizar `docs/00_parte_tecnica.md`:
  - R2 en el stack y en las decisiones;
  - `marca` e `imagen_clave` en el modelo de datos;
  - la estructura de `apps/web` en la sección 3;
  - el Sprint 1.5 en la tabla de la sección 8;
  - la deuda de `marca NOT NULL`.

  En `docs/01_arquitectura_despliegue.md`, agregar R2 y la ruta de imágenes. Se verifica con una lectura de los dos documentos y con `pnpm format:check`
- [ ] 11.3 Ejecutar `semilla:catalogo` contra Neon para completar las marcas. Esto lo hace el desarrollador. Se verifica con `GET https://api.xdtech.store/facetas`, que devuelve marcas

## Workflow follow-up

- Archivar el cambio con `/opsx:archive` cuando la definición de hecho esté verificada.
- Proponer el Sprint 2 (`docs/sprint_02_motor_reglas.md`) reutilizando ProductCard y SpecsTable.
