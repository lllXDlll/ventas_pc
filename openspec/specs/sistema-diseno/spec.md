# sistema-diseno Specification

## Purpose
Define la identidad visual y los mínimos de accesibilidad y de estados de interfaz que cumple toda pantalla del frontend, para que las pantallas de los sprints siguientes se vean y se comporten igual sin repetir estilos.

## Requirements

### Requirement: Colores definidos solo como tokens
Los colores del frontend SHALL definirse una sola vez como tokens en un único archivo de estilos, con la paleta del tema oscuro (fondo, superficie, tarjeta, borde, texto, texto secundario, principal morado, secundario azul, éxito, advertencia y peligro). Ningún otro archivo del frontend MUST contener valores de color hexadecimales ni clases de color arbitrarias.

#### Scenario: Comprobación de colores sueltos
- **WHEN** la CI busca valores hexadecimales de color en los archivos del frontend fuera del archivo de tokens
- **THEN** no encuentra ninguno y el paso pasa

#### Scenario: Color introducido en un componente
- **WHEN** un cambio agrega `#FF0000` o una clase `bg-[#...]` en un componente
- **THEN** la verificación de la CI falla

### Requirement: Degradado de marca restringido
El degradado de marca (de morado a azul) SHALL usarse solo en el logo, en el hero del inicio y en el botón "Arma tu PC con IA".

#### Scenario: Revisión de la vitrina
- **WHEN** se revisa la vitrina de componentes y las pantallas
- **THEN** el degradado aparece solo en esos tres elementos

### Requirement: Contraste AA
Todo texto del frontend MUST cumplir el contraste WCAG AA con su fondo: 4,5:1 para texto normal y 3:1 para texto de 24 px o más.

#### Scenario: Análisis automático de accesibilidad
- **WHEN** las pruebas de navegador analizan con axe el inicio, el catálogo, el detalle, el inicio de sesión, el registro, `/recuperar` y el panel
- **THEN** no hay infracciones de contraste

### Requirement: Tipografía y precios
La interfaz SHALL usar Inter para el texto y Space Grotesk para títulos y precios, servidas por el propio sitio. Los precios MUST mostrarse en soles con el formato `es-PE` (`S/ 1,299.00`).

#### Scenario: Precio en la tarjeta
- **WHEN** se muestra un producto con precio `1299.00`
- **THEN** el precio se lee `S/ 1,299.00` en la tipografía de títulos

### Requirement: Diseño adaptable
Todas las pantallas SHALL verse sin cortes ni desplazamiento horizontal en anchos de 360, 768 y 1280 px, con el contenido limitado a 1280 px de ancho.

#### Scenario: Móvil
- **WHEN** las pruebas de navegador abren cada pantalla con 360 px de ancho
- **THEN** el ancho del documento no supera el de la ventana

### Requirement: Uso con teclado y foco visible
El mega menú, el menú lateral móvil, los diálogos y los formularios SHALL poder usarse solo con el teclado (Tab, Enter, Esc). Todo elemento enfocado MUST mostrar un indicador de foco visible.

#### Scenario: Mega menú con teclado
- **WHEN** un usuario abre el mega menú con Enter, recorre las categorías con Tab y pulsa Esc
- **THEN** el menú se cierra y el foco vuelve al botón que lo abrió

#### Scenario: Menú lateral móvil
- **WHEN** en 360 px un usuario abre el menú lateral con el teclado
- **THEN** el foco queda dentro del menú hasta cerrarlo con Esc

### Requirement: Estados de carga, vacío y error
Toda pantalla que muestra datos de la API SHALL tener un estado de carga (esqueleto), un estado vacío con un mensaje y un estado de error con el mensaje de la API y una forma de reintentar.

#### Scenario: Catálogo sin resultados
- **WHEN** los filtros del catálogo no devuelven productos
- **THEN** la pantalla muestra un mensaje de que no hay resultados y una forma de limpiar los filtros

#### Scenario: API caída
- **WHEN** la API no responde al cargar el catálogo
- **THEN** la pantalla muestra un mensaje de error y un botón para reintentar, sin quedar en blanco

### Requirement: Acciones de sprints futuros marcadas
Los botones y accesos que dependen de funciones de sprints posteriores (carrito, asistente y ofertas) SHALL estar visibles, pero MUST indicar "Disponible pronto" y MUST NOT ejecutar ninguna acción contra la API. El armado manual deja de estar en esta lista desde el Sprint 2.

#### Scenario: Añadir al carrito
- **WHEN** un visitante pulsa "Añadir al carrito" en el detalle de un producto
- **THEN** ve "Disponible pronto" y no se envía ninguna petición
