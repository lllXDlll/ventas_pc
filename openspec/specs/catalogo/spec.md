# catalogo Specification

## Purpose
Mantiene el catálogo de componentes y equipos armados con sus atributos técnicos y su stock, administrable por el ADMIN y visible para los clientes con su disponibilidad, como base del motor de compatibilidad y de la compra.

## Requirements

### Requirement: Categorías del catálogo
El catálogo SHALL tener las categorías PROCESADOR, PLACA_MADRE, RAM, TARJETA_GRAFICA, FUENTE, GABINETE, ALMACENAMIENTO y EQUIPO_ARMADO, cargadas por semilla y consultables con `GET /categorias` sin sesión.

#### Scenario: Listar categorías
- **WHEN** cualquier visitante llama a `GET /categorias`
- **THEN** la API responde 200 con el código y el nombre de las ocho categorías

### Requirement: Alta de producto
Un ADMIN SHALL poder crear un producto con nombre, categoría, tipo, precio no negativo, stock inicial no negativo y atributos técnicos. El producto y su stock MUST crearse juntos, con la versión de stock en 0. Un producto de la categoría EQUIPO_ARMADO MUST tener tipo EQUIPO, y los de las demás categorías, tipo COMPONENTE.

#### Scenario: Componente válido
- **WHEN** un ADMIN envía `POST /admin/productos` con un procesador, su precio, un stock inicial de 10 y sus atributos obligatorios
- **THEN** la API responde 201 con el producto, su stock de 10 y la versión 0

#### Scenario: Equipo armado
- **WHEN** un ADMIN crea un producto de la categoría EQUIPO_ARMADO con tipo EQUIPO y stock inicial 3
- **THEN** se crea como un producto propio con su propio stock de 3

#### Scenario: Tipo incoherente con la categoría
- **WHEN** se intenta crear un producto de la categoría RAM con tipo EQUIPO
- **THEN** la API responde 400 y no crea nada

### Requirement: Atributos técnicos validados por categoría
Al crear o actualizar un producto, sus atributos SHALL validarse contra los atributos obligatorios de su categoría y sus tipos (texto, entero positivo, lista o medidas). Si falta un atributo obligatorio o tiene un tipo inválido, la API MUST responder 400 indicando cuál, sin guardar cambios.

#### Scenario: Atributo obligatorio ausente
- **WHEN** un ADMIN crea un procesador sin el atributo `socket`
- **THEN** la API responde 400 con un mensaje que nombra `socket`

#### Scenario: Tipo inválido
- **WHEN** un ADMIN crea una fuente con `potenciaEntregadaW: "mucha"`
- **THEN** la API responde 400 con un mensaje que nombra `potenciaEntregadaW`

### Requirement: Actualización de precio, estado y atributos
Un ADMIN SHALL poder actualizar el nombre, el precio, el estado activo y los atributos de un producto con `PATCH /admin/productos/:id`. Los cambios MUST verse en el catálogo público en la siguiente consulta.

#### Scenario: Cambio de precio
- **WHEN** un ADMIN cambia el precio de un producto
- **THEN** `GET /productos/:id` devuelve el nuevo precio

#### Scenario: Producto inexistente
- **WHEN** se actualiza un identificador que no existe
- **THEN** la API responde 404

### Requirement: Stock con bloqueo optimista
`PATCH /admin/stock/:productoId` SHALL fijar la cantidad física solo si la versión enviada coincide con la actual. En ese caso, la versión MUST aumentar en 1. Si la versión es obsoleta, MUST responder 409 con `{ codigo: CONFLICTO, mensaje }`, la versión vigente y la cantidad vigente, sin cambiar el stock. Una cantidad negativa MUST rechazarse con 400.

#### Scenario: Versión vigente
- **WHEN** un ADMIN envía cantidad 20 con la versión actual 3
- **THEN** el stock queda en 20 con versión 4 y la API responde 200

#### Scenario: Versión obsoleta
- **WHEN** dos administradores leen la versión 3 y el segundo guarda después que el primero
- **THEN** el segundo recibe 409 con la versión 4 y el stock conserva el valor guardado por el primero

### Requirement: Catálogo público filtrable y paginado
`GET /productos` SHALL listar sin sesión los productos activos con disponible mayor que cero. Admite filtros por categoría y por rango de precio (mínimo y máximo, inclusivos) y paginación, con 20 por página por defecto y un máximo de 100. Cada elemento MUST incluir el identificador, el nombre, la categoría, el tipo, el precio, la disponibilidad y los atributos técnicos. Junto a la lista se devuelve el total de resultados.

#### Scenario: Filtro por categoría y precio
- **WHEN** un visitante pide `GET /productos?categoria=RAM&precioMin=100&precioMax=300`
- **THEN** recibe solo productos RAM activos con precio entre 100 y 300 y disponible mayor que cero

#### Scenario: Paginación
- **WHEN** hay 45 productos que cumplen el filtro y se pide la página 3 con 20 por página
- **THEN** la respuesta trae 5 productos y un total de 45

#### Scenario: Parámetros inválidos
- **WHEN** `precioMin` es mayor que `precioMax` o `porPagina` es mayor que 100
- **THEN** la API responde 400

### Requirement: Productos sin disponible ocultos como disponibles
Un producto con disponible cero MUST NOT aparecer en el listado público ni presentarse como disponible. Cuando vuelve a tener disponible, SHALL reaparecer sin otra acción. Su detalle con `GET /productos/:id` sigue accesible y lo marca como agotado. Un producto inactivo responde 404 en el detalle público.

#### Scenario: Producto agotado
- **WHEN** el stock de un producto activo llega a 0
- **THEN** deja de aparecer en `GET /productos` y su detalle lo muestra con disponibilidad 0 y como agotado

#### Scenario: Reposición
- **WHEN** un ADMIN repone stock de ese producto
- **THEN** vuelve a aparecer en `GET /productos`

### Requirement: Disponibilidad a través del puerto del almacén
La disponibilidad que muestra el catálogo SHALL obtenerse del servicio de disponibilidad. En este cambio, ese servicio devuelve el stock físico de Postgres; el Sprint 3 lo reemplaza por el disponible del almacén sin cambiar las respuestas del catálogo.

#### Scenario: Disponibilidad igual al stock físico
- **WHEN** un producto tiene stock físico 7
- **THEN** el catálogo informa una disponibilidad de 7

### Requirement: Catálogo de ejemplo
Una semilla reproducible SHALL cargar un catálogo de ejemplo con productos de todas las categorías: al menos dos sockets de procesador, dos tipos de RAM, fuentes de distinta potencia, gabinetes de distinto factor de forma y al menos un equipo armado. Ejecutarla de nuevo MUST NOT duplicar productos.

#### Scenario: Semilla repetida
- **WHEN** se ejecuta la semilla del catálogo dos veces
- **THEN** el número de productos es el mismo después de cada ejecución

### Requirement: Pantallas del catálogo
El frontend SHALL ofrecer un catálogo con filtros por categoría y precio, una página de detalle con los atributos técnicos y la disponibilidad, y un panel de administración para crear productos, editar el precio, el estado y los atributos, y actualizar el stock con aviso de conflicto de versión.

#### Scenario: Conflicto visible en el panel
- **WHEN** un ADMIN guarda el stock con una versión obsoleta
- **THEN** el panel muestra el aviso de conflicto y la cantidad vigente
