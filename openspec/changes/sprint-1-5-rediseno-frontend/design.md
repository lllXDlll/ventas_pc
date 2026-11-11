# Design

## Context

Motivación y alcance: ver proposal.md. Los requisitos están en `specs/` de este cambio. Fuente funcional: `docs/Sprint 1.5 Rediseño del frontend.md`, con tres desviaciones decididas al planificar: se amplía la API, se agregan marca e imagen, y `/recuperar` solo muestra "Disponible pronto".

**Estado de partida al cierre del Sprint 1**
- **Frontend (`apps/web`):**
  - Next.js 16.4.6, React 19.3.1 y App Router, sin Tailwind ni ninguna librería de UI;
  - estilos en `app/globals.css`;
  - páginas en `app/` (`page.tsx`, `catalogo`, `catalogo/[id]`, `ingresar`, `registro` y `admin/catalogo`), con el contexto de sesión en `app/sesion.tsx`;
  - en `lib/`: `api.ts` (con `api()`, `apiServidor()`, `ErrorApi` y `formatoPrecio`) y `atributos.ts` (copia de la tabla D8, que una prueba de la API mantiene sincronizada);
  - el catálogo y el detalle se renderizan en el servidor;
  - `AGENTS.md` advierte que esta versión de Next cambia APIs y que hay que leer `node_modules/next/dist/docs/` antes de escribir código.
- **API, catálogo:**
  - `GET /productos` filtra por categoría, precio y paginación, con orden fijo por nombre;
  - `GET /admin/productos` solo pagina;
  - los productos no tienen marca ni imagen;
  - la API no tiene almacenamiento de objetos.
- **Pruebas e2e:** las de Playwright (`tests/e2e`) usan selectores como:
  - `article.tarjeta`;
  - el botón "Filtrar";
  - las etiquetas "Correo", "Contraseña", "Categoría", "Precio (S/)", "Stock inicial" y `potenciaEntregadaW`;
  - el rol `banner` con el correo y los enlaces "Panel" e "Ingresar";
  - el rol `status`.
  Las `@humo` corren contra producción.
- **Restricciones vigentes:**
  - 10 ms de CPU por petición, con medianas medidas de 15 ms en `GET /productos`;
  - 50 subrequests por petición;
  - OpenNext se compila solo en Linux (CI);
  - el despliegue depende de los jobs `verificar` y `e2e`.

## Goals / Non-Goals

**Goals:**
- Un sistema de diseño y una estructura del frontend que los Sprints 2 a 5 usen sin rehacer layout ni componentes.
- Que el patrón de capas y la regla de colores se comprueben solos en la CI, no en revisión manual.
- Filtros, facetas e imágenes resueltos en la API, sin filtrar en el cliente ni traer el catálogo completo.
- Mantener los comportamientos del Sprint 1 y sus pruebas, adaptando solo los selectores.

**Non-Goals:**
- Modo claro, internacionalización y varias imágenes por producto.
- Optimización de imágenes en el borde (redimensionado o formatos automáticos).
- Recuperación de contraseña (HU-03).
- Pruebas unitarias de componentes de React. La separación entre presentación y datos se impone con reglas de lint (D2) y los flujos se prueban con Playwright.
- Cambiar el disponible real (Sprint 3) o los contratos existentes. Solo se agregan campos y parámetros.

## Decisions

### D1. Patrón de arquitectura del frontend
Se combinan tres patrones conocidos y cada uno tiene una tarea concreta:
1. **Organización por funcionalidad** (feature-based): `features/catalogo`, `features/auth` y `features/admin`, cada una con `api.ts` (llamadas tipadas), `hooks/` (TanStack Query) y `components/`.
2. **Contenedor y presentación:**
   - los contenedores son los hooks y los componentes `*Contenedor` de cada funcionalidad: leen datos y manejan estados;
   - los componentes de presentación, como `ProductCard`, `SpecsTable` y `StockBadge`, solo reciben props.
3. **Atomic Design** en `components/ui`:
   - átomos: Button, Input, Badge y Skeleton;
   - moléculas: Card, FormField y Dialog;
   - `components/layout` reúne los organismos del shell.

```text
apps/web/src/
  app/            (tienda)/ inicio, catalogo, catalogo/[id] · (auth)/ ingresar, registro, recuperar
                  admin/ catalogo · dev/ui · layout.tsx · providers.tsx
  features/       catalogo/ · auth/ · admin/      {api.ts, hooks/, components/, schemas.ts}
  components/     ui/ (shadcn/ui adaptado) · layout/ (TopBar, Header, MegaMenu, QuickLinks, MobileDrawer, Footer, AdminShell)
  lib/            api-client.ts · format.ts · atributos.ts · iconos-categoria.ts · utils.ts (cn)
  styles/         tokens.css (único archivo con hex) · globals.css
```

Se conservan las rutas actuales (`/catalogo`, `/catalogo/[id]`, `/ingresar`, `/registro` y `/admin/catalogo`). Los grupos `(tienda)` y `(auth)` no cambian las URL, así que las pruebas `@humo` y los enlaces existentes siguen valiendo. La ruta que el documento llama `producto/[id]` se queda en `catalogo/[id]`.

*Alternativas:* mantener todo en `app/` con carpetas `_components`, que no da ninguna regla de dependencias, o Feature-Sliced Design completo, con más capas de las que pide un proyecto de este tamaño.

### D2. Regla de capas en ESLint
Se usa `no-restricted-imports` de ESLint, con bloques por carpeta en `eslint.config.mjs`. No hace falta ningún plugin nuevo:
- **`components/**` y `lib/**`:** prohibido importar `@/features/*` y `@/app/*`, y `lib/**` tampoco importa `@/components/*`.
- **`features/<x>/**`:** prohibido importar `@/app/*` y `@/features/<otra>`. Se escribe un bloque por funcionalidad.
- **`app/**`:** prohibido importar `@/lib/api-client`. Las rutas pasan por los `api.ts` y los hooks de cada funcionalidad.
- **`features/*/components/**` (presentación):** prohibido importar `@/lib/api-client`, `@tanstack/react-query` y el hook de sesión. Lo que necesiten llega por props.

El alias `@/` se configura en `tsconfig.json` y apunta a `src/`. Los imports relativos que suben de nivel (`../../features`) quedan prohibidos, para que la regla no se pueda saltar.

### D3. Tokens, Tailwind y shadcn/ui
- **Tailwind CSS v4**, con configuración en CSS y `@tailwindcss/postcss`.
- **`styles/tokens.css`** declara las variables del documento (`--bg` … `--danger`, más el degradado `--gradiente-marca`), los radios y las sombras de hover. Es el único lugar con hex.
- **`globals.css`** importa Tailwind y los tokens, y los mapea con `@theme inline` (`--color-bg: var(--bg)`, …). Así existen las clases `bg-bg`, `text-primary-soft`, `border-border`, etc.
- **shadcn/ui** se inicializa en la variante para Tailwind v4 y React 19. Su CLI genera colores `oklch` en `globals.css`; se borran y sus variables semánticas (`--background`, `--primary`, …) se apuntan a nuestros tokens. Los componentes copiados en `components/ui` se adaptan a las variantes del documento:
  - Button: `primario`, `secundario`, `fantasma` y `degradado`;
  - Badge: `exito`, `advertencia`, `peligro` e `ia`.
- **Comprobación de colores sueltos:** `scripts/sin-colores-sueltos.mjs`, en Node y multiplataforma (en Windows no hay `grep` fiable). Recorre `apps/web/src` (`.ts`, `.tsx` y `.css`, excepto `styles/tokens.css`) buscando `#[0-9a-fA-F]{3,8}\b` y clases arbitrarias de color (`-\[#`), y falla si encuentra alguna. Corre en `pnpm lint`. Amplía el criterio del documento, que solo miraba `.tsx`.
- **Contraste:** los pares de la tabla del documento ya superan AA. Se comprueba con axe (D11).
- **Fuentes:** Inter y Space Grotesk con `next/font/google`. Se descargan en el build y el propio sitio las sirve, sin peticiones a Google desde el navegador. Se exponen como `--font-sans` y `--font-display`.
- **Iconos:** lucide-react con `strokeWidth={1.5}`. `lib/iconos-categoria.ts` asigna un icono por categoría (Cpu, CircuitBoard, MemoryStick, una tarjeta gráfica, Zap, Box, HardDrive, Monitor).
- **Nombre y logo:** la tienda se llama **XDTech** (decidido el 2026-11-11). El logo es el texto "XDTech" en Space Grotesk con el degradado de marca, en un componente `Logo` propio.

*Alternativas:* CSS Modules sin Tailwind, que obliga a escribir a mano todo lo que shadcn ya resuelve en accesibilidad, o Tailwind v3 con `tailwind.config.ts`, que shadcn ya no usa como variante por defecto.

### D4. Datos en el cliente con TanStack Query, sin perder el render en el servidor
- **Proveedor:** `app/providers.tsx` crea un `QueryClient` por navegador, con `staleTime` de 30 s y sin reintentos para los errores 4xx.
- **Páginas públicas** (inicio, catálogo y detalle):
  - siguen siendo componentes de servidor que precargan con `queryClient.prefetchQuery` (usando `apiServidor`) y pasan el estado con `HydrationBoundary`;
  - los contenedores cliente leen con `useProductos`, `useProducto` y `useFacetas` sobre las mismas claves;
  - así se conservan el HTML con datos (útil para el SEO y para las `@humo`) y el estado en caché al navegar entre filtros.
- **Panel administrativo y sesión:** son solo de cliente.
  - `useSesion` pasa a ser `useQuery(['me'])` en `features/auth`;
  - el inicio y el cierre de sesión invalidan `['me']`;
  - el panel invalida `['admin','productos']` tras cada cambio.
- **`lib/api-client.ts`** sustituye a `lib/api.ts`:
  - mantiene `credentials: 'include'`;
  - no hay ningún "token" en el cliente, porque la sesión es la cookie `httpOnly` (D3 del Sprint 1); el documento menciona un token y se corrige;
  - incluye `ErrorApi` con `codigo`, `mensaje` y `detalle`, y `urlImagen(ruta)`, que antepone `NEXT_PUBLIC_API_URL`.

### D5. Filtros en la dirección
Los filtros del catálogo viven en los parámetros de la URL (`categoria`, `marca`, `socket`, `precioMin`, `precioMax`, `q`, `orden` y `pagina`), que son la fuente de verdad. Por eso recargar o compartir el enlace conserva el estado.
- Cambiar un filtro hace `router.replace` y vuelve a la página 1.
- Los chips muestran los filtros activos y quitan cada uno por separado.
- El buscador de la cabecera navega a `/catalogo?q=…`.

Se mantiene el formulario con el botón "Filtrar" para la categoría y el precio, para que funcione sin JavaScript y se conserve la prueba actual. Las marcas y los sockets son casillas que se aplican al instante.

### D6. Ampliación de `GET /productos` y de `GET /admin/productos`
Se amplía `FiltrosCatalogoDto`:
- `marca`: texto. Admite varias separadas por coma; como máximo 10, de hasta 60 caracteres cada una.
- `socket`: texto de hasta 30 caracteres.
- `q`: de 2 a 60 caracteres.
- `orden`: uno de `nombre`, `precio_asc` o `precio_desc`.

Cómo se traducen a `where` en Prisma:
- **marca:** `OR` de `{ marca: { equals, mode: 'insensitive' } }`.
- **socket:** `{ atributos: { path: ['socket'], equals } }`, que en PostgreSQL es un filtro JSONB sobre la misma consulta.
- **q:** `OR` de `nombre` o `marca` con `contains` y `mode: 'insensitive'`.
- **orden:** se convierte en `orderBy`, siempre con `id` como desempate para que la paginación sea estable.
- **Índices:** no se crean índices nuevos, porque el catálogo tiene decenas de productos y la consulta ya filtra por `(categoria_id, activo)`. Se revisa si crece.

`PaginaAdminDto` gana `q` y `categoria`, con las mismas reglas. La respuesta pública y la administrativa agregan `marca: string | null` e `imagenUrl: string | null`. No se quita ningún campo.

### D7. `GET /facetas`
Va en una ruta propia, no en `/productos/facetas`, para no chocar con `GET /productos/:id`. Acepta `categoria` como parámetro opcional y responde `{ marcas: [{ valor, cantidad }], sockets: [{ valor, cantidad }], precio: { min, max } }`, contando solo los productos activos con stock mayor que 0. Esto se cambiará por el disponible del almacén en el Sprint 3, igual que el listado.

Son tres consultas en la conexión de la petición (D1 del Sprint 1):
- `groupBy` por `marca`;
- un `$queryRaw` con `atributos->>'socket'` y `GROUP BY`, porque Prisma no agrupa por una ruta JSON;
- un `aggregate` de precio.

El `$queryRaw` usa una plantilla etiquetada, así que no se concatena ningún texto. Las marcas y los sockets nulos se omiten.

El mega menú usa `GET /facetas` sin categoría para su columna de marcas, y el catálogo la usa con la categoría elegida. Se mide la CPU con `wrangler tail`: el objetivo es que quede en el orden de `GET /productos`.

### D8. Columna `marca`
La migración nueva agrega `marca text NULL`. Admite nulos para no romper la migración sobre los datos de Neon, y la semilla rellena la marca de los 19 productos de ejemplo por su UUID fijo:
- la semilla pasa de `create` a `upsert` sobre `marca`;
- el `count` sigue sin duplicar productos.

Es obligatoria en `CrearProductoDto` (`IsString`, `MinLength(1)`, `MaxLength(60)`, sin espacios en los extremos) y opcional en `ActualizarProductoDto`. Cuando todos los productos tengan marca, un sprint posterior puede pasarla a `NOT NULL`. Queda anotado como deuda.

### D9. Imágenes en R2
- **Infraestructura:**
  - binding `IMAGENES` y bucket `xdtech-imagenes` en `wrangler.jsonc`;
  - en `wrangler dev`, y por tanto en Playwright y en las integraciones, R2 se simula en local con `--persist-to`;
  - Vitest con `@cloudflare/vitest-pool-workers` también lo simula.
- **Columna:** la migración agrega `imagen_clave text NULL`, con claves de la forma `productos/<id>/<uuid>.<ext>`. Una clave nueva por subida hace que cada imagen tenga una URL distinta (requisito de caché).
- **Subida, `PUT /admin/productos/:id/imagen`** (`@Roles('ADMIN')`):
  - el cuerpo es el binario crudo, con `Content-Type` `image/jpeg`, `image/png` o `image/webp`; no se usa multipart ni multer;
  - para esa ruta se registra `express.raw({ type: [...], limit: '2mb' })`;
  - el tipo se comprueba por los bytes iniciales (`FF D8 FF`, `89 50 4E 47 0D 0A 1A 0A`, y `RIFF....WEBP`); si no cuadra, responde 415 `TIPO_NO_ADMITIDO`;
  - si el cuerpo supera el límite, Express lanza un error 413, que `filtro-errores` traduce a `{ codigo: 'IMAGEN_DEMASIADO_GRANDE', mensaje }`;
  - el orden es: `R2.put` de la clave nueva, luego `UPDATE productos SET imagen_clave`, y después `R2.delete` de la anterior;
  - si el `UPDATE` falla, se borra la nueva. Si falla el borrado de la anterior, queda un objeto huérfano, que se registra en el log; no tiene efecto visible.
- **Borrado, `DELETE /admin/productos/:id/imagen`:** primero pone la columna a `NULL` y después borra el objeto. Responde 204.
- **Entrega, `GET /productos/:id/imagen/:archivo`:**
  - es público y solo responde para productos activos cuya `imagen_clave` termine en `:archivo`;
  - hace stream del cuerpo de R2 con `Content-Type`, `ETag` y `Cache-Control: public, max-age=31536000, immutable`;
  - `imagenUrl` es esa ruta relativa y el frontend le antepone el origen de la API.
- **Costo:** cada subida o lectura hace 1 subrequest a R2 y no lee el archivo entero en JavaScript más allá de comprobar el tipo. Se mide la CPU de una subida de 2 MB en la validación previa (tarea 0.2).
- **Frontend:**
  - usa `<img loading="lazy">` con ancho y alto fijos dentro del recuadro claro 1:1, sin `next/image`, porque OpenNext está sin optimizador de imágenes;
  - sin imagen, muestra el icono de la categoría en el mismo recuadro.
- **Plan B:** si R2 no puede activarse en la cuenta (la activación pide aceptar los términos de R2 en el panel) o la prueba falla, no se guardan imágenes en Postgres, porque el plan gratuito de Neon tiene 0,5 GB y el tráfico pasaría por Hyperdrive. En ese caso:
  - se despliega todo menos la subida;
  - los productos muestran el icono;
  - se registra en `docs/compatibilidad-cloudflare.md`.

*Alternativas:* bucket público en un subdominio (`img.xdtech.store`), que no gasta peticiones del Worker al servir pero expone el bucket y no funciona igual en local, o imágenes por URL externa, que el ADMIN no controla y puede romperse. Se descartan.

### D10. Pantallas: contenido concreto
- **`/recuperar`:** usa `AuthCard` con el título "Recuperar acceso", el texto "Disponible pronto" y una explicación breve: hoy el administrador restablece la cuenta. Tiene un enlace para volver a iniciar sesión, sin campos.
- **Botones "Añadir al carrito" y "Usar en mi armado", y accesos "Armador IA", "Arma tu PC" y "Ofertas":** son botones con `aria-disabled` y el texto o la etiqueta emergente "Disponible pronto". "Equipos armados" sí funciona, porque lleva a `/catalogo?categoria=EQUIPO_ARMADO`.
- **Contador del carrito en la cabecera:** un icono con 0 y la etiqueta "Carrito (disponible pronto)".
- **Pie:**
  - la columna "Cuenta" enlaza `/ingresar` y `/registro`;
  - la columna "Tienda" enlaza al catálogo por categoría;
  - "Ayuda" y "Redes" son textos sin enlace hasta que existan esas páginas.
- **Insignia de stock:**
  - `disponible > 5` → "En stock" (`exito`);
  - `1..5` → "Últimas N unidades" (`advertencia`), con el singular "Última unidad";
  - `0` → "Agotado" (`peligro`), solo en el detalle, porque el listado no muestra productos agotados.
- **Chips de atributos de `ProductCard`:** hasta 3, tomados por categoría de una lista fija en `lib/atributos.ts` (por ejemplo `socket`, `tipoRam`, `potenciaEntregadaW` con " W").
- **Selectores que usan las pruebas actuales:** se conservan los nombres accesibles que ya usan:
  - la cabecera es `<header>` (`banner`), con el correo del usuario y los enlaces "Panel" e "Ingresar";
  - el botón "Cerrar sesión";
  - las etiquetas de los formularios;
  - el rol `status` para los avisos del panel.
  La tarjeta deja de depender de la clase `tarjeta`. Las pruebas pasan a localizarla por `getByRole('article')`, que es el marcado nuevo.

### D11. Pruebas
- **API:**
  - pruebas de integración nuevas: filtros por marca, socket y `q`, el orden y su estabilidad al paginar, las facetas (con un producto agotado), la marca obligatoria y las imágenes (subida válida, reemplazo con borrado del objeto anterior, 413, 415 con un `Content-Type` falso, 401 y 403, borrado, entrega con encabezados de caché, y stock y versión intactos);
  - una prueba unitaria de la detección del tipo por bytes;
  - la prueba `rutas-admin.e2e` sigue enumerando todas las rutas `/admin` y cubre la nueva automáticamente.
- **Playwright:**
  - se adaptan los selectores de `cuenta`, `catalogo` y `panel`;
  - se agrega `@axe-core/playwright` y una prueba por pantalla sin infracciones `serious` ni `critical`, incluido el contraste;
  - una prueba que, con 360 px, comprueba que `scrollWidth <= innerWidth` en las 7 pantallas;
  - una de teclado para el mega menú y el menú lateral, con Esc y el foco de vuelta;
  - y flujos nuevos: filtros por marca en la URL, búsqueda desde la cabecera, `/recuperar` y la subida de imagen en el panel (con un PNG pequeño en `tests/e2e/archivos/`).
  - Las `@humo` siguen siendo de solo lectura.
- **Lighthouse móvil en `/catalogo`:** se mide a mano contra producción y se registra en `docs/compatibilidad-cloudflare.md`. Los objetivos son accesibilidad ≥ 90 y rendimiento ≥ 80. No se automatiza, porque en la CI el resultado depende de la máquina.

### D12. Despliegue y orden
- Las columnas nuevas admiten nulos, así que la migración es compatible con el código anterior.
- La CI ya aplica migraciones antes de desplegar la API y despliega la API antes que la web.
- **Antes del primer push con el binding R2**, hay que:
  1. activar R2 en la cuenta;
  2. crear el bucket con `wrangler r2 bucket create xdtech-imagenes`;
  3. comprobar que el `CLOUDFLARE_API_TOKEN` de la CI tiene el permiso de R2 necesario para desplegar con el binding.
  Si no, `wrangler deploy` falla y la versión anterior sigue en servicio.
- La semilla de marcas se ejecuta una vez a mano contra Neon (`semilla:catalogo`, que ahora completa la marca), como en el Sprint 1.

### Nota de la tarea 0.3 (versiones y guías de Next 16.4, 2026-11-11)
Sin diferencias con D1–D4.
- **Versiones:** Next 16.4.6, React 19.3.1 y App Router.
- **Paquetes a instalar** (última estable de cada uno):
  - tailwindcss y @tailwindcss/postcss 4.3.5;
  - shadcn 4.23 (con `radix-ui` 1.8, cva, clsx, tailwind-merge y tw-animate-css);
  - lucide-react 1.72;
  - react-hook-form 7.92 y @hookform/resolvers 7.0;
  - zod 4.6;
  - @tanstack/react-query 5.107;
  - @axe-core/playwright 4.14.
  - Los publicados hace menos de un día los resuelve pnpm a la versión anterior, por su antigüedad mínima.
- **Lo que confirman las guías de `node_modules/next/dist/docs/`:**
  - Tailwind v4 con `@tailwindcss/postcss` y `postcss.config.mjs` (`01-getting-started/11-css.md`);
  - `next/font/google` sirve las fuentes desde el propio dominio y expone una variable CSS con la opción `variable` (`03-api-reference/02-components/font.md`);
  - los grupos de rutas no cambian la URL y no deben resolver a la misma ruta; se usa un solo layout raíz, así que no hay recargas completas al navegar entre grupos (`route-groups.md`);
  - `metadata.robots` con `index: false` para `/dev/ui`.

## Risks / Trade-offs

- **[El rediseño se come el sprint, ahora con la API ampliada]** → El orden de recorte del documento sigue vigente: columna de marcas del mega menú, chips y edición de stock en línea. Si hace falta más, las imágenes pasan a un sprint posterior; la API y el frontend ya quedan preparados con el icono como respaldo.
- **[Mover todo el frontend rompe pruebas]** → La reestructuración (tarea 5.1) va en un commit aislado y sin cambios visuales, y antes de seguir se corren `typecheck`, el build y Playwright.
- **[shadcn/ui y Tailwind v4 frente a Next 16.4 y React 19.3]** → Antes de instalar se revisan las versiones y la guía de Next en `node_modules/next/dist/docs/`. pnpm no instala versiones con menos antigüedad que la mínima; nunca se salta esa política.
- **[CPU de `GET /productos` con más filtros, ya en 15 ms de mediana]** → Los filtros nuevos no agregan consultas. Las facetas tienen tres consultas en una sola conexión. Se mide con `wrangler tail` y, si se dispara, se cachean las facetas en el cliente (`staleTime` largo).
- **[R2 no disponible en la cuenta]** → Plan B en D9. La validación es la primera tarea, antes de construir sobre R2.
- **[Las imágenes servidas por el Worker gastan peticiones del plan gratuito]** → La caché del navegador es inmutable y la URL cambia con cada imagen, así que cada visitante descarga una imagen una sola vez. Si hiciera falta, se agrega `caches.default` en el Worker.
- **[Diseño demasiado parecido a PcComponentes]** → De esa tienda solo se toma la estructura. El logo, los colores, los textos y las imágenes son propios.

## Migration Plan

1. Validar R2 desde el Worker de producción (endpoint temporal o script con `wrangler`) y registrar el resultado. Si no es OK, aplicar el plan B y seguir.
2. Aplicar la migración `productos_marca_imagen`: local, CI y Neon (automática en el despliegue).
3. Desplegar la API con los filtros, las facetas, la marca y las imágenes. Es compatible con la web anterior, porque solo agrega campos.
4. Ejecutar `semilla:catalogo` contra Neon para completar las marcas.
5. Desplegar la web rediseñada.

**Vuelta atrás:** se revierte el commit y la CI redespliega. Las columnas nuevas pueden quedarse, porque admiten nulos y el código anterior las ignora.

## Open Questions

- **¿`marca` pasa a `NOT NULL` en un sprint posterior?** Queda anotado como deuda.
