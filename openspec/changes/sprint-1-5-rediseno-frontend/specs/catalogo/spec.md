# Spec Delta

## MODIFIED Requirements

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

### Requirement: Catálogo de ejemplo
Una semilla reproducible SHALL cargar un catálogo de ejemplo con productos de todas las categorías, cada uno con su marca: al menos dos sockets de procesador, dos marcas de procesador, dos tipos de RAM, fuentes de distinta potencia, gabinetes de distinto factor de forma y al menos un equipo armado. Ejecutarla de nuevo MUST NOT duplicar productos, y MUST completar la marca de los productos que ya existían sin ella.

#### Scenario: Semilla repetida
- **WHEN** se ejecuta la semilla del catálogo dos veces
- **THEN** el número de productos es el mismo después de cada ejecución

#### Scenario: Productos previos sin marca
- **WHEN** se ejecuta la semilla sobre una base con el catálogo de ejemplo del Sprint 1
- **THEN** todos los productos de ejemplo quedan con su marca

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

## ADDED Requirements

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
