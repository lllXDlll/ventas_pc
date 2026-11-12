# Proposal

## Why

Al cierre del Sprint 1 el frontend funciona, pero sus pantallas son funcionales y sin estilo. Además, todo el código está en `app/` y en dos archivos de `lib/`, sin capas. Los sprints siguientes van a construir encima el armador, el carrito, el pago y el asistente, y reutilizarán la tarjeta de producto, la insignia de stock y la tabla de especificaciones. Si no hay un sistema de diseño ni una estructura con reglas de dependencia, cada pantalla nueva repetirá estilos y lógica, y el pulido quedará para el final, cuando ya no hay tiempo.

`docs/Sprint 1.5 Rediseño del frontend.md` define el rediseño. Al revisarlo contra el código aparecieron tres huecos. Ningún sprint posterior los cubre:
- los productos no tienen marca ni imagen;
- la API no filtra por marca, por socket ni por texto, y no permite elegir el orden;
- no existe ningún endpoint de recuperación de acceso, porque HU-03 está diferida.

Este sprint los resuelve. Por eso, a diferencia de lo que dice el documento, sí amplía la API.

## What Changes

**Sistema de diseño y patrón del frontend**
- **Tokens de diseño en un único `styles/tokens.css`:** tema oscuro, morado como color principal y azul como secundario, con contraste WCAG AA, mapeados al tema de Tailwind CSS. También fija las tipografías Inter y Space Grotesk con `next/font`, la escala tipográfica, el espaciado en múltiplos de 4 px, los radios de 8, 12 y 16 px y los iconos lucide-react.
- **Patrón de arquitectura del frontend.** El código se organiza por funcionalidad (`features/<nombre>/{api, hooks, components}`). Dentro de cada funcionalidad se separan contenedores (lectura de datos con TanStack Query) y componentes de presentación (solo props). Los componentes visuales genéricos siguen Atomic Design en `components/ui`, sobre shadcn/ui. La regla de dependencias es que cada capa solo importa de las de abajo: `app → features → components → lib`. ESLint la hace cumplir en la CI.
- **Componentes base y vitrina interna `/dev/ui`.** Los componentes base son Button, Input, Badge, Card, Skeleton y Dialog. Los formularios usan react-hook-form y zod.

**Rediseño de las pantallas existentes**
- **Shell global:**
  - banda superior;
  - cabecera fija con buscador;
  - mega menú con las 8 categorías y una columna de marcas;
  - accesos rápidos;
  - pie en 4 columnas con distintivos de confianza;
  - en móvil, un menú lateral.
- **Inicio:** hero, rejilla de categorías, 8 productos destacados y banda de confianza.
- **Catálogo:**
  - filtros por categoría, precio, marca y socket, con chips de filtros activos;
  - búsqueda, orden y paginación.
- **Detalle de producto:** imagen, precio, insignia de stock y tabla de especificaciones.
- **Login, registro y `/recuperar`:** `/recuperar` solo muestra "Disponible pronto", sin formulario.
- **Panel administrativo:** barra lateral, tabla de productos con búsqueda y filtro por categoría, formulario con campos técnicos por categoría, marca e imagen, y edición de stock en línea.
- **Estados de carga, vacío y error:** cada pantalla con datos tiene skeleton, estado vacío y estado de error.
- **Acciones de sprints futuros:** los botones de carrito, armado y accesos de esos sprints se ven, pero muestran "Disponible pronto".

**Ampliación de la API y del esquema** (decisión de este sprint; el documento original prohibía tocar `apps/api`)
- **Marca:** columna `marca` en `productos`. Es obligatoria al crear un producto y editable después. Las semillas la rellenan.
- **Imagen opcional:**
  - columna `imagen_clave` en `productos`;
  - las imágenes se guardan en un bucket de **Cloudflare R2**;
  - el ADMIN puede subir (JPEG, PNG o WebP, hasta 2 MB), reemplazar y borrar la imagen de cada producto;
  - la API la sirve con caché larga;
  - sin imagen, el frontend muestra el icono de la categoría.
- **Catálogo público, nuevos filtros:**
  - `GET /productos` acepta `marca` (una o varias), `socket`, `q` (texto en nombre y marca) y `orden` (`nombre`, `precio_asc`, `precio_desc`);
  - cada producto incluye `marca` e `imagenUrl`.
- **Facetas:** endpoint nuevo `GET /facetas`, que devuelve las marcas y sockets con disponible (con su cantidad) y el rango de precios, opcionalmente por categoría.
- **Lista administrativa:** `GET /admin/productos` acepta `q` y `categoria`.
- **Validación previa de R2 en Workers:** subida, lectura y borrado desde el Worker en producción, registrada en `docs/compatibilidad-cloudflare.md`. Ningún sprint se apoya en un supuesto sin resultado OK.

**Documentación**
- `docs/Sprint 1.5 Rediseño del frontend.md` se reescribe donde ya no aplica: la ampliación de la API, la marca, las imágenes, `/recuperar` como "Disponible pronto" y la cookie en lugar de un "token" en el cliente.
- `docs/00_parte_tecnica.md` y `docs/01_arquitectura_despliegue.md` incorporan R2, las columnas nuevas, la estructura del frontend y el Sprint 1.5 en la tabla de sprints.

Fuera de este cambio:
- el armador (Sprint 2);
- el carrito y las reservas (Sprint 3);
- el pago (Sprint 4);
- el asistente (Sprint 5);
- el modo claro;
- la recuperación de contraseña real (HU-03, sigue diferida);
- varias imágenes por producto.

## Capabilities

### New Capabilities

- `sistema-diseno`: tokens visuales, tipografía, contraste AA, responsive, foco visible y navegación por teclado, y estados de carga, vacío y error que cumple toda pantalla del frontend.
- `arquitectura-frontend`: organización por funcionalidad, separación entre contenedores y componentes de presentación, regla de dependencias entre capas verificada en la CI y vitrina interna de componentes.
- `imagenes-producto`: subida, reemplazo, borrado y entrega de la imagen opcional de cada producto, con tipos y tamaño limitados.

### Modified Capabilities

- `catalogo`:
  - alta y edición con marca;
  - catálogo público con filtros por marca, socket y texto, y con orden;
  - facetas;
  - búsqueda y filtro en la lista administrativa;
  - pantallas rediseñadas (shell, inicio, listado, detalle y panel).
- `autenticacion`: pantallas de cuenta rediseñadas, con validación en línea y `/recuperar` como "Disponible pronto".
- `esquema-datos`: productos con marca y con clave de imagen opcional.
- `validacion-plataforma`: prueba de R2 desde el Worker antes de depender de él.

## Impact

- **`apps/web`:**
  - reestructuración completa de `src/`, con `app/` por grupos de rutas, `features/`, `components/ui`, `components/layout`, `lib/` y `styles/`;
  - dependencias nuevas: Tailwind CSS, shadcn/ui (Radix), lucide-react, react-hook-form, zod y @tanstack/react-query.
- **`apps/api`:**
  - DTOs y servicio del catálogo;
  - un controlador de imágenes;
  - un binding R2 en `wrangler.jsonc` y en `worker-configuration.d.ts`;
  - una migración de Prisma;
  - las semillas, que ahora llevan marcas.
- **Cloudflare:**
  - hay que activar R2 en la cuenta;
  - crear los buckets de producción y de vista previa;
  - y comprobar que el token de la CI permite desplegar un Worker con binding R2.
- **Pruebas:**
  - pruebas de integración nuevas (filtros, facetas, imágenes);
  - selectores de Playwright adaptados al nuevo marcado, sin cambiar los comportamientos probados;
  - comprobaciones de accesibilidad con axe en Playwright;
  - y una regla de lint que impide colores hex fuera de `tokens.css`.
- **Cronograma:** el plan pasa de 8 a 9 semanas.
- **Contratos existentes:** los campos nuevos se agregan a las respuestas y no se quita ninguno, así que el cambio de API no rompe los clientes actuales.
