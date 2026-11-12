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
Un ADMIN SHALL poder crear un producto con nombre, marca, categoría, tipo, precio no negativo, stock inicial no negativo y atributos técnicos. El producto y su stock MUST crearse juntos, con la versión de stock en 0. Un producto de la categoría EQUIPO_ARMADO MUST tener tipo EQUIPO, y los de las demás categorías, tipo COMPONENTE. La marca MUST ser un texto no vacío.

#### Scenario: Componente válido
- **WHEN** un ADMIN envía `POST /admin/productos` con un procesador, su marca, su precio, un stock inicial de 10 y sus atributos obligatorios
- **THEN** la API responde 201 con el producto, su marca, su stock de 10 y la versión 0

#### Scenario: Equipo armado
- **WHEN** un ADMIN crea un producto de la categoría EQUIPO_ARMADO con tipo EQUIPO y stock inicial 3
- **THEN** se crea como un producto propio con su propio stock de 3

#### Scenario: Tipo incoherente con la categoría
- **WHEN** se intenta crear un producto de la categoría RAM con tipo EQUIPO
- **THEN** la API responde 400 y no crea nada

#### Scenario: Marca ausente
- **WHEN** un ADMIN crea un producto sin marca o con la marca vacía
- **THEN** la API responde 400 con un mensaje que nombra la marca y no crea nada

### Requirement: Atributos técnicos validados por categoría
Al crear o actualizar un producto, sus atributos SHALL validarse contra los atributos obligatorios de su categoría y sus tipos (texto, entero positivo, lista o medidas). La placa madre MUST incluir además su velocidad máxima de RAM. Los atributos opcionales conocidos (el alto del disipador del procesador) MUST validarse por tipo cuando están presentes. Si falta un atributo obligatorio o uno tiene un tipo inválido, la API MUST responder 400 indicando cuál, sin guardar cambios.

#### Scenario: Atributo obligatorio ausente
- **WHEN** un ADMIN crea un procesador sin el atributo `socket`
- **THEN** la API responde 400 con un mensaje que nombra `socket`

#### Scenario: Tipo inválido
- **WHEN** un ADMIN crea una fuente con `potenciaEntregadaW: "mucha"`
- **THEN** la API responde 400 con un mensaje que nombra `potenciaEntregadaW`

#### Scenario: Placa sin velocidad máxima de RAM
- **WHEN** un ADMIN crea una placa madre sin `velocidadRamMaxMhz`
- **THEN** la API responde 400 con un mensaje que nombra `velocidadRamMaxMhz`

#### Scenario: Alto de disipador opcional
- **WHEN** un ADMIN crea un procesador sin `altoDisipadorMm`, y otro con `altoDisipadorMm: -5`
- **THEN** el primero se crea y el segundo recibe 400 con un mensaje que nombra `altoDisipadorMm`

### Requirement: Actualización de precio, estado y atributos
Un ADMIN SHALL poder actualizar el nombre, la marca, el precio, el estado activo y los atributos de un producto con `PATCH /admin/productos/:id`. Los cambios MUST verse en el catálogo público en la siguiente consulta.

#### Scenario: Cambio de precio
- **WHEN** un ADMIN cambia el precio de un producto
- **THEN** `GET /productos/:id` devuelve el nuevo precio

#### Scenario: Cambio de marca
- **WHEN** un ADMIN cambia la marca de un producto
- **THEN** `GET /productos/:id` devuelve la nueva marca y el filtro por la marca anterior deja de incluirlo

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
`GET /productos` SHALL listar sin sesión los productos activos con disponible mayor que cero. Admite filtros por categoría, por rango de precio (mínimo y máximo, inclusivos), por una o varias marcas, por socket y por texto (en el nombre y la marca, sin distinguir mayúsculas), además de un orden (`nombre`, `precio_asc` o `precio_desc`; por defecto `nombre`) y paginación, con 20 por página por defecto y un máximo de 100. Cada elemento MUST incluir el identificador, el nombre, la marca, la categoría, el tipo, el precio, la disponibilidad, los atributos técnicos y la URL de la imagen si la tiene. Junto a la lista se devuelve el total de resultados.

#### Scenario: Filtro por categoría y precio
- **WHEN** un visitante pide `GET /productos?categoria=RAM&precioMin=100&precioMax=300`
- **THEN** recibe solo productos RAM activos con precio entre 100 y 300 y disponible mayor que cero

#### Scenario: Filtro por marca y socket
- **WHEN** un visitante pide `GET /productos?categoria=PROCESADOR&marca=AMD&socket=AM5`
- **THEN** recibe solo procesadores AMD con socket AM5 y disponible mayor que cero

#### Scenario: Varias marcas
- **WHEN** un visitante pide `GET /productos?marca=AMD,Intel`
- **THEN** recibe los productos de cualquiera de las dos marcas

#### Scenario: Búsqueda por texto
- **WHEN** un visitante pide `GET /productos?q=ryzen`
- **THEN** recibe los productos cuyo nombre o marca contiene "ryzen" sin distinguir mayúsculas

#### Scenario: Orden por precio
- **WHEN** un visitante pide `GET /productos?orden=precio_desc`
- **THEN** los productos llegan del más caro al más barato y el total no cambia respecto del orden por nombre

#### Scenario: Paginación
- **WHEN** hay 45 productos que cumplen el filtro y se pide la página 3 con 20 por página
- **THEN** la respuesta trae 5 productos y un total de 45

#### Scenario: Parámetros inválidos
- **WHEN** `precioMin` es mayor que `precioMax`, `porPagina` es mayor que 100 u `orden` no es uno de los valores admitidos
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
La disponibilidad que muestra el catálogo SHALL obtenerse del servicio de disponibilidad, que desde el Sprint 3 la lee del almacén de disponibilidad: stock físico menos reservas activas. Las respuestas del catálogo MUST conservar su forma; solo cambia el valor de `disponible`.

#### Scenario: Disponibilidad igual al stock físico
- **WHEN** un producto tiene stock físico 7 y ninguna reserva activa
- **THEN** el catálogo informa una disponibilidad de 7

#### Scenario: Disponibilidad con reservas
- **WHEN** un producto tiene stock físico 7 y una reserva activa de 2
- **THEN** el catálogo informa una disponibilidad de 5

#### Scenario: Todo reservado
- **WHEN** las reservas activas de un producto igualan su stock físico
- **THEN** el producto no aparece en el listado público y su detalle lo marca como agotado

### Requirement: Catálogo de ejemplo
Una semilla reproducible SHALL cargar un catálogo de ejemplo con productos de todas las categorías, cada uno con su marca: al menos dos sockets de procesador, dos marcas de procesador, dos tipos de RAM, fuentes de distinta potencia, gabinetes de distinto factor de forma y al menos un equipo armado. Las placas madre MUST tener su velocidad máxima de RAM, y al menos un procesador, el alto de su disipador. Ejecutarla de nuevo MUST NOT duplicar productos, y MUST completar la marca y los atributos que falten en los productos ya existentes, sin pisar los valores editados.

#### Scenario: Semilla repetida
- **WHEN** se ejecuta la semilla del catálogo dos veces
- **THEN** el número de productos es el mismo después de cada ejecución

#### Scenario: Productos previos sin marca
- **WHEN** se ejecuta la semilla sobre una base con el catálogo de ejemplo del Sprint 1
- **THEN** todos los productos de ejemplo quedan con su marca

#### Scenario: Atributo nuevo en datos existentes
- **WHEN** se ejecuta la semilla sobre una base cuyas placas de ejemplo no tienen `velocidadRamMaxMhz`
- **THEN** las placas quedan con ese atributo, y los demás atributos que un ADMIN cambió conservan su valor

### Requirement: Pantallas del catálogo
El frontend SHALL ofrecer un inicio con las categorías y productos destacados, un catálogo con filtros por categoría, precio, marca y socket, búsqueda, orden y paginación, una página de detalle con imagen, precio, disponibilidad y la tabla de atributos técnicos, y un panel de administración para buscar y filtrar productos, crearlos y editar su marca, precio, estado, atributos e imagen, y actualizar el stock con aviso de conflicto de versión.

#### Scenario: Conflicto visible en el panel
- **WHEN** un ADMIN guarda el stock con una versión obsoleta
- **THEN** el panel muestra el aviso de conflicto y la cantidad vigente

#### Scenario: Filtros en la dirección
- **WHEN** un visitante aplica en el catálogo la categoría PROCESADOR y la marca AMD, y recarga la página
- **THEN** los filtros siguen aplicados, se ven como chips y los resultados son los mismos

#### Scenario: Búsqueda desde la cabecera
- **WHEN** un visitante escribe "ryzen" en el buscador de la cabecera y lo envía
- **THEN** llega al catálogo con esa búsqueda aplicada

#### Scenario: Últimas unidades
- **WHEN** un producto tiene disponible 3
- **THEN** su tarjeta y su detalle indican "Últimas 3 unidades"; con más de 5 indican "En stock"

#### Scenario: Campos técnicos según la categoría
- **WHEN** un ADMIN elige la categoría FUENTE en el formulario de producto
- **THEN** el formulario pide la potencia entregada y no los campos de otras categorías

### Requirement: Facetas del catálogo
`GET /facetas` SHALL devolver sin sesión, para los productos activos con disponible mayor que cero y opcionalmente para una categoría, las marcas y los sockets con la cantidad de productos de cada uno, y el precio mínimo y máximo.

#### Scenario: Facetas de procesadores
- **WHEN** un visitante pide `GET /facetas?categoria=PROCESADOR`
- **THEN** recibe las marcas y los sockets de los procesadores con disponible, cada uno con su cantidad, y el rango de precios

#### Scenario: Producto agotado fuera de las facetas
- **WHEN** el único producto de una marca se agota
- **THEN** esa marca deja de aparecer en las facetas

### Requirement: Búsqueda en la lista administrativa
`GET /admin/productos` SHALL aceptar, además de la paginación, una búsqueda por texto en el nombre y la marca y un filtro por categoría. La lista incluye productos inactivos y agotados.

#### Scenario: Buscar un producto inactivo
- **WHEN** un ADMIN busca por el nombre de un producto inactivo
- **THEN** lo recibe en la lista con su estado inactivo
