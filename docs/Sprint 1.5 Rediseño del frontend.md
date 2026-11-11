# Sprint 1.5: Rediseño del frontend

Nov 11, 2026 · @erick

## Objetivo y alcance

En 5 días hábiles (unas 39 horas) el frontend pasa de pantallas funcionales sin estilo a una tienda con identidad propia, un sistema de diseño reutilizable y una estructura de carpetas por capas. No se agrega lógica de negocio nueva: los endpoints y contratos del Sprint 1 no cambian.

**Entra en el sprint:**

- Sistema de diseño: tokens de color (morado, azul, negro), tipografía, espaciado y componentes base.
- Estructura del frontend por capas, con una regla clara de dependencias.
- Rediseño de lo que ya existe tras el Sprint 1: shell global (cabecera, menú de categorías, pie), inicio, listado y detalle de catálogo, inicio de sesión, registro, recuperación de acceso y panel administrativo de catálogo y stock.
- Componentes que los sprints siguientes van a reutilizar (tarjeta de producto, insignia de stock, tabla de especificaciones), aunque su pantalla final llegue después.

**No entra:** la interfaz del armador manual (Sprint 2), carrito y reservas (Sprint 3), pago e historial (Sprint 4), asistente de IA (Sprint 5) y modo claro.

**Efecto en el cronograma:** el plan de 8 semanas pasa a 9. Si la fecha de entrega es fija, recupera esa semana en la Fase 6: como el pulido visual ya queda hecho aquí, esa fase se reduce a reportes, límites de peticiones y pruebas de carga.

## Qué tomar de PcComponentes

Toma la estructura de navegación y la jerarquía de la [página de inicio de PcComponentes](https://www.pccomponentes.com/), no su marca. Tu diferencia es el armador con IA, así que ocupa el lugar que allá tienen las campañas de ofertas.

| Patrón de PcComponentes | Cómo lo adaptas |
| --- | --- |
| Banda superior de anuncios | Una línea con un mensaje rotativo: "Arma tu PC con IA y valida compatibilidad al instante" |
| Cabecera con logo, cuenta y cesta | Logo propio a la izquierda, buscador al centro, "Mi cuenta" y carrito con contador a la derecha |
| Botón "Todas las categorías" con mega menú en columnas | Mega menú con tus 8 categorías (procesador, placa madre, RAM, tarjeta gráfica, fuente, gabinete, almacenamiento, equipos armados) y columna de marcas |
| Franja de accesos rápidos bajo la cabecera | Armador IA, Arma tu PC, Equipos armados, Ofertas |
| Rejilla de categorías con imagen e icono | Rejilla de 8 tarjetas con icono de línea |
| Distintivos de confianza en el pie | Compatibilidad validada, stock real, pago seguro (simulado), soporte local en Ayacucho |
| Pie con enlaces institucionales y redes | Pie en 4 columnas: tienda, ayuda, cuenta y redes |

**No copies:** el logo, el naranja, sus textos ni sus fotos. Deja fuera los bloques de blog, servicios, reacondicionados y marketplace: están fuera del alcance de tu propuesta.

## Sistema de diseño

Tema oscuro: negro azulado de fondo, morado para la acción principal y azul para la secundaria. Todos los pares de texto y fondo de esta tabla superan el mínimo WCAG AA de 4.5:1 (calculado con la fórmula de luminancia relativa).

| Token | Hex | Uso | Contraste |
| --- | --- | --- | --- |
| `--bg` | #0B0B12 | Fondo de la página |  |
| `--surface` | #13131F | Cabecera, pie, barra lateral |  |
| `--card` | #1B1B2B | Tarjetas, menús, modales |  |
| `--border` | #2A2A40 | Bordes y separadores |  |
| `--text` | #F4F4F8 | Texto principal | 17.9:1 sobre `--bg` |
| `--text-muted` | #A3A3B8 | Texto secundario | 6.9:1 sobre `--card` |
| `--primary` | #7C3AED | Botón principal, enlaces activos | 5.7:1 con texto blanco |
| `--primary-hover` | #6D28D9 | Hover del botón principal | 7.1:1 con texto blanco |
| `--primary-soft` | #A78BFA | Texto morado sobre fondo oscuro | 6.2:1 sobre `--card` |
| `--secondary` | #2563EB | Botón secundario, insignias de IA | 5.2:1 con texto blanco |
| `--secondary-soft` | #60A5FA | Texto azul sobre fondo oscuro | 7.7:1 sobre `--bg` |
| `--success` | #22C55E | En stock, compatible | 7.4:1 sobre `--card` |
| `--warning` | #FBBF24 | Últimas unidades | 10.2:1 sobre `--card` |
| `--danger` | #F87171 | Agotado, incompatible, errores | 6.1:1 sobre `--card` |

**Degradado de marca:** `linear-gradient(135deg, #7C3AED, #2563EB)`. Úsalo solo en el hero, el botón "Arma tu PC con IA" y el logo. Si aparece en todas partes, deja de señalar lo importante.

**Imágenes de producto:** las fotos de componentes suelen venir con fondo blanco. Pon cada imagen dentro de un recuadro claro (#F4F4F8, esquinas de 12 px) para que no se vean como cuadros blancos pegados sobre el negro.

**Tipografía:** Inter para la interfaz y Space Grotesk para títulos y precios, cargadas con `next/font`. Escala: 12, 14, 16, 18, 20, 24, 30 y 36 px. Precios en 24 px y peso 700, con formato `S/ 1,299.00` usando `Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' })`.

**Espaciado y forma:** múltiplos de 4 px. Radios de 8 px (botones, inputs), 12 px (tarjetas) y 16 px (modales). Sin sombras en reposo; en hover, borde `--primary` y un brillo leve `0 0 0 1px #7C3AED, 0 8px 24px rgba(124,58,237,.25)`.

**Iconos:** lucide-react, trazo de 1.5 px. Ejemplos por categoría: `Cpu` (procesador), `CircuitBoard` (placa madre), `MemoryStick` (RAM), `HardDrive` (almacenamiento), `Zap` (fuente), `Box` (gabinete), `Monitor` (equipos armados).

**Breakpoints:** 360 px (móvil), 768 px (tableta), 1280 px (escritorio). El contenido se limita a 1280 px de ancho.

## Arquitectura y patrón del frontend

Organiza el código por funcionalidad (feature-based) y, dentro de cada funcionalidad, separa contenedores de componentes de presentación. Los componentes visuales genéricos siguen Atomic Design en `components/ui`. La regla que lo sostiene todo: cada capa solo importa de las capas de abajo.

&#91;embedded content: capas del frontend · 4 niveles\]

Si un componente de `components/ui` necesita datos de un producto, recíbelos por props: nunca importa de `features/`.

**Herramientas:** Tailwind CSS con los tokens de la sección anterior como variables CSS, shadcn/ui (componentes sobre Radix que se copian al repo y puedes editar), lucide-react para iconos, react-hook-form con zod para formularios y TanStack Query para leer la API con caché y estados de carga. Antes de instalar, revisa qué versión de Next.js y Tailwind ya tiene `apps/web` y usa la variante de shadcn que corresponda.

```text
apps/web/src/
  app/                      rutas (App Router): solo componen páginas
    (tienda)/               inicio, catalogo, producto/[id]
    (auth)/                 login, registro, recuperar
    admin/                  productos, stock
    dev/ui/                 vitrina interna de componentes
  features/
    catalogo/
      api.ts                llamadas al backend (fetch tipado)
      hooks/                useProductos, useProducto (TanStack Query)
      components/           ProductCard, ProductGrid, FiltrosSidebar, SpecsTable
    auth/                   LoginForm, RegistroForm, RecuperarForm, schemas zod
    admin/                  ProductoForm, StockEditor, ProductosTable
  components/
    ui/                     átomos y moléculas: Button, Input, Badge, Card, Skeleton, Dialog
    layout/                 TopBar, Header, MegaMenu, QuickLinks, Footer, AdminShell
  lib/
    api-client.ts           base URL, token, manejo de errores
    format.ts               formatoPrecio, formatoStock
  styles/
    tokens.css              único archivo con colores hex
```

En la práctica: `ProductCard` recibe un producto por props y no llama a la API. `useProductos` trae los datos. La página en `app/(tienda)/catalogo` une ambos. Así, en el Sprint 2 el armador reutiliza `ProductCard` y `SpecsTable` sin tocarlos.

## Pantallas y componentes

Son 7 pantallas sobre un mismo shell. Cada una necesita sus estados de carga (skeleton), vacío y error, no solo el estado con datos.

| Pantalla | Qué debe tener | Componentes nuevos |
| --- | --- | --- |
| Shell global | Banda superior, cabecera fija al hacer scroll, buscador, mega menú, accesos rápidos, pie. En móvil, menú lateral (drawer) y buscador desplegable | TopBar, Header, SearchBar, MegaMenu, QuickLinks, MobileDrawer, Footer |
| Inicio | Hero con degradado y dos botones ("Arma tu PC con IA" y "Ver catálogo"), rejilla de 8 categorías, 8 productos destacados, banda de confianza | Hero, CategoryGrid, ProductGrid, TrustBar |
| Catálogo | Breadcrumbs, filtros a la izquierda (categoría, rango de precio, marca, socket), chips de filtros activos, orden (precio, nombre), rejilla de 4 columnas en escritorio y 2 en móvil, paginación | FiltrosSidebar, FilterChips, SortSelect, Pagination |
| Detalle de producto | Imagen grande, nombre, precio, insignia de stock, tabla de especificaciones leída del JSONB de atributos, botones "Añadir al carrito" y "Usar en mi armado" | SpecsTable, StockBadge, ProductGallery |
| Login, registro y recuperación | Tarjeta centrada sobre fondo con degradado tenue, validación en línea, mensajes de error del backend legibles | AuthCard, FormField |
| Admin: productos | Barra lateral, tabla con búsqueda, filtro por categoría y acciones por fila | AdminShell, DataTable |
| Admin: formulario y stock | Campos técnicos que cambian según la categoría (socket para procesador y placa, tipo y velocidad para RAM, vatios para fuente), edición de stock en línea | ProductoForm, AtributosFields, StockEditor |

**Tarjeta de producto (`ProductCard`), el componente que más se repite:**

1. Imagen 1:1 en recuadro claro.
2. Nombre en 2 líneas como máximo, cortado con `line-clamp-2`.
3. Hasta 3 chips con atributos clave (por ejemplo `AM5`, `DDR5`, `65 W`).
4. Precio en Space Grotesk 24 px.
5. Insignia de stock: "En stock" (verde) o "Últimas 3 unidades" (ámbar) cuando quedan 5 o menos.
6. Botón de acción que aparece completo en hover en escritorio y siempre visible en móvil.

Los productos con stock 0 no se muestran como disponibles, igual que en el Sprint 1. Los botones de carrito y armado quedan visibles pero muestran "Disponible pronto" hasta los Sprints 2 y 3, para no rehacer el layout después.

## Backlog y plan por día

19 tareas, 39 horas, un commit por tarea. El orden importa: primero tokens y componentes base, porque todo lo demás se arma con ellos.

| ID | Día | Tarea | Horas |
| --- | --- | --- | --- |
| T01 | 1 | Revisar versiones de Next.js y Tailwind; instalar shadcn/ui, lucide-react, react-hook-form, zod y TanStack Query | 1 |
| T02 | 1 | Crear `tokens.css` y mapear los tokens al tema de Tailwind | 2 |
| T03 | 1 | Cargar Inter y Space Grotesk con `next/font` | 0.5 |
| T04 | 1 | Componentes base: Button (primario, secundario, fantasma, degradado), Input, Badge, Card, Skeleton, Dialog | 3.5 |
| T05 | 1 | Ruta `/dev/ui` con todos los componentes y variantes | 1 |
| T06 | 2 | TopBar, Header fijo y SearchBar | 3 |
| T07 | 2 | MegaMenu de categorías con columna de marcas | 2.5 |
| T08 | 2 | QuickLinks y Footer | 1 |
| T09 | 2 | MobileDrawer y revisión del shell en 360, 768 y 1280 px | 1.5 |
| T10 | 3 | ProductCard, StockBadge y `formatoPrecio` en soles | 3 |
| T11 | 3 | Inicio: Hero, CategoryGrid, destacados y TrustBar | 2.5 |
| T12 | 3 | Mover el código de catálogo a `features/catalogo` con hooks de TanStack Query | 1.5 |
| T13 | 4 | Listado: filtros, chips, orden y paginación | 4.5 |
| T14 | 4 | Detalle de producto con SpecsTable | 2.5 |
| T15 | 4 | Estados de carga, vacío y error en inicio, listado y detalle | 1 |
| T16 | 5 | Login, registro y recuperación con AuthCard y validación zod | 2 |
| T17 | 5 | AdminShell y DataTable de productos | 2.5 |
| T18 | 5 | ProductoForm con campos técnicos por categoría y StockEditor | 1.5 |
| T19 | 5 | QA: Lighthouse, contraste, teclado, responsive y pruebas del Sprint 1 | 2 |

**Antes de T13:** confirma si la API de catálogo acepta filtros por marca, socket y precio. Si no los acepta, filtra en el cliente durante este sprint y anota el cambio de API como deuda para el Sprint 2. No agregues endpoints aquí.

**Si te atrasas:** recorta en este orden: columna de marcas del mega menú (T07), chips de filtros activos (T13) y edición de stock en línea (T18; el stock se sigue editando desde el formulario). Lo demás lo usan los sprints siguientes.

## Criterios de aceptación

El sprint se cierra cuando todo lo de esta lista se cumple y se puede comprobar, no cuando "se ve bien".

- [ ] Ningún color hex fuera de `styles/tokens.css`. Comprobación: `grep -rnE "#[0-9a-fA-F]{3,8}\b" apps/web/src --include=*.tsx` no devuelve resultados.
- [ ] Todo texto cumple contraste AA (4.5:1 normal, 3:1 en texto de 24 px o más).
- [ ] Lighthouse móvil en `/catalogo`: accesibilidad 90 o más, rendimiento 80 o más.
- [ ] Las 7 pantallas se ven sin cortes ni scroll horizontal en 360, 768 y 1280 px.
- [ ] El mega menú, el drawer y los formularios se usan solo con teclado (Tab, Enter, Esc) y muestran foco visible.
- [ ] Cada pantalla con datos tiene estado de carga, vacío y error.
- [ ] Los productos sin stock siguen sin aparecer como disponibles.
- [ ] Registro, sesión, recuperación, roles y CRUD de catálogo funcionan igual que al cierre del Sprint 1, y sus pruebas pasan en CI.
- [ ] Ningún componente de `components/ui` importa de `features/`.
- [ ] `/dev/ui` muestra todos los componentes base con sus variantes.

## Prompt para Claude Code

Pégalo al empezar cada día y cambia solo la línea `DÍA`. Exige un plan antes de tocar código para que puedas frenar cambios fuera de alcance.

```text
Contexto: monorepo con apps/web (Next.js) y apps/api (NestJS). El Sprint 1 (auth y catálogo) está terminado y funciona. Ahora hacemos el Sprint 1.5: rediseño visual del frontend. Está prohibido modificar apps/api, el esquema de Prisma o los contratos de la API.

DÍA: 1 (tareas T01 a T05)

Reglas:
1. Antes de escribir código, lee apps/web, dime las versiones de Next.js, React y Tailwind, si usa App Router o Pages Router, y lista los archivos que vas a crear, mover o editar. Espera mi aprobación.
2. Estilo visual inspirado en la estructura de PcComponentes (banda superior, cabecera con buscador, mega menú de categorías, accesos rápidos, rejillas de productos, pie con distintivos), con identidad propia y tema oscuro.
3. Colores solo desde apps/web/src/styles/tokens.css como variables CSS mapeadas al tema de Tailwind. Ningún hex en archivos .tsx ni clases arbitrarias tipo bg-[#...].
   --bg #0B0B12, --surface #13131F, --card #1B1B2B, --border #2A2A40,
   --text #F4F4F8, --text-muted #A3A3B8,
   --primary #7C3AED, --primary-hover #6D28D9, --primary-soft #A78BFA,
   --secondary #2563EB, --secondary-soft #60A5FA,
   --success #22C55E, --warning #FBBF24, --danger #F87171.
   Degradado de marca: linear-gradient(135deg, #7C3AED, #2563EB), solo en hero, logo y botón "Arma tu PC con IA".
4. Tipografía: Inter (interfaz) y Space Grotesk (títulos y precios) con next/font. Espaciado en múltiplos de 4 px. Radios 8/12/16 px. Iconos lucide-react.
5. Estructura: app/ solo compone páginas; features/<nombre>/{api.ts, hooks/, components/}; components/ui (shadcn/ui) y components/layout; lib/. components/ui nunca importa de features/.
6. Componentes de presentación sin llamadas a la API: reciben datos por props. Los datos se leen con hooks de TanStack Query en features/*/hooks.
7. Precios en soles con Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).
8. Productos sin stock no se muestran como disponibles. Mantén esa regla del Sprint 1.
9. Cada pantalla con datos tiene estados de carga (Skeleton), vacío y error.
10. Accesible: foco visible, navegación por teclado en menús y formularios, contraste AA.
11. Un commit por tarea con el ID en el mensaje, por ejemplo "feat(web): T04 componentes base".
12. Al terminar el día: ejecuta lint, pruebas y build; reporta qué se hizo, qué quedó pendiente y cualquier decisión que tomaste sin preguntarme.

Tareas del sprint (haz solo las del día indicado):
T01 versiones e instalación de shadcn/ui, lucide-react, react-hook-form, zod, @tanstack/react-query
T02 tokens.css y tema de Tailwind
T03 fuentes con next/font
T04 Button (primario, secundario, fantasma, degradado), Input, Badge, Card, Skeleton, Dialog
T05 ruta /dev/ui con todos los componentes
T06 TopBar, Header fijo, SearchBar
T07 MegaMenu con 8 categorías y columna de marcas
T08 QuickLinks (Armador IA, Arma tu PC, Equipos armados, Ofertas) y Footer
T09 MobileDrawer y revisión en 360, 768 y 1280 px
T10 ProductCard (imagen 1:1 en recuadro claro, nombre en 2 líneas, 3 chips de atributos, precio, StockBadge), formatoPrecio
T11 Inicio: Hero, CategoryGrid, 8 destacados, TrustBar
T12 mover catálogo a features/catalogo con hooks
T13 listado con filtros (categoría, precio, marca, socket), chips, orden y paginación; si la API no filtra, filtra en cliente y avísame
T14 detalle de producto con SpecsTable desde el JSONB de atributos
T15 estados de carga, vacío y error
T16 login, registro y recuperación con AuthCard y zod
T17 AdminShell y DataTable de productos
T18 ProductoForm con campos técnicos por categoría y StockEditor
T19 QA: Lighthouse, contraste, teclado, responsive y pruebas del Sprint 1
```

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El pulido visual se come la semana | Límite de 39 horas y orden de recorte definido en el backlog. Lo que no entra pasa a la Fase 6 |
| Claude Code toca el backend o reescribe lógica que ya funciona | Regla 1 del prompt (plan antes de código) y prohibición explícita sobre `apps/api`. Revisa el diff de cada commit |
| Al mover archivos a `features/` se rompen rutas o pruebas del Sprint 1 | Hacer T12 en un commit aislado y correr las pruebas antes de seguir |
| Choque de versiones entre shadcn/ui y la versión de Tailwind instalada | T01 revisa versiones antes de instalar nada |
| La API no filtra por marca o socket | Filtro en cliente por ahora y cambio de API anotado para el Sprint 2 |
| El diseño queda demasiado parecido a PcComponentes | Logo, nombre, colores, textos e imágenes propios; solo se toma la estructura |

**Nombre de la tienda (decidido el 2026-11-11):** XDTech. El logo es el texto "XDTech" con el degradado de marca.
