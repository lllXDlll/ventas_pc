# configuraciones Specification

## Purpose
Permite que un cliente guarde, retome y actualice sus armados de PC sin comprarlos, con su resultado de compatibilidad y la indicación de si pueden avanzar al carrito.

## Requirements

### Requirement: Guardar una configuración
Un usuario con sesión SHALL poder guardar una configuración con `POST /configuraciones`, enviando productos y cantidades. Se guarda con origen MANUAL, a su nombre, junto con sus productos. Sin sesión, la API MUST responder 401.

#### Scenario: Guardado
- **WHEN** un CLIENTE guarda un procesador y una placa madre
- **THEN** la API responde 201 con el identificador, los productos, el estado y los rechazos

#### Scenario: Sin sesión
- **WHEN** un visitante sin sesión intenta guardar
- **THEN** la API responde 401 y no se guarda nada

### Requirement: Composición válida
Una configuración MUST tener a lo sumo un procesador, una placa madre, una fuente, un gabinete y una tarjeta gráfica, y cantidad 1 en cada uno. La RAM y el almacenamiento MAY repetirse y tener cantidad mayor a 1, hasta 8 por producto. Un equipo armado, un producto inexistente o un producto inactivo MUST responder 400.

#### Scenario: Dos procesadores
- **WHEN** se guarda una configuración con dos procesadores
- **THEN** la API responde 400 y no se guarda nada

#### Scenario: Equipo armado
- **WHEN** se incluye un equipo armado
- **THEN** la API responde 400

### Requirement: Estado de validación guardado
Al guardar o actualizar, la configuración SHALL validarse con el motor de compatibilidad. Su estado MUST quedar `VALIDA` si no hay rechazos e `INVALIDA` si los hay. La respuesta MUST incluir los rechazos.

#### Scenario: Configuración incompatible
- **WHEN** se guarda un procesador LGA1700 con una placa AM5
- **THEN** el estado es `INVALIDA` y la respuesta trae el rechazo `SOCKET`

### Requirement: Agregable al carrito
La respuesta de una configuración SHALL indicar si es agregable al carrito. Lo es solo si no tiene rechazos, tiene al menos un producto y todos sus productos están activos y con disponible suficiente para la cantidad elegida. Una configuración incompatible MUST NOT ser agregable.

#### Scenario: Incompatible
- **WHEN** la configuración tiene un rechazo
- **THEN** no es agregable al carrito

#### Scenario: Producto agotado
- **WHEN** una configuración sin rechazos incluye un producto cuyo disponible llegó a 0
- **THEN** al leerla no es agregable y se indica qué producto no tiene disponible suficiente

### Requirement: Actualizar una configuración
El dueño SHALL poder reemplazar los productos de su configuración con `PATCH /configuraciones/:id`, que vuelve a validarla. Otro usuario MUST recibir 404, sin revelar que existe.

#### Scenario: Cambio de placa
- **WHEN** el dueño cambia la placa AM5 por una LGA1700 que coincide con su procesador
- **THEN** la configuración pasa a `VALIDA`

#### Scenario: Configuración ajena
- **WHEN** un usuario intenta modificar la configuración de otro
- **THEN** la API responde 404 y la configuración no cambia

### Requirement: Leer y listar configuraciones propias
`GET /configuraciones/:id` SHALL devolver la configuración del usuario con sus productos, su estado, los rechazos recalculados con el catálogo actual y si es agregable. `GET /configuraciones` SHALL listar solo las del usuario, de la más reciente a la más antigua. La configuración de otro usuario MUST responder 404.

#### Scenario: Lectura ajena
- **WHEN** un usuario pide la configuración de otro
- **THEN** la API responde 404

#### Scenario: Lista propia
- **WHEN** un usuario con dos configuraciones pide `GET /configuraciones`
- **THEN** recibe solo sus dos configuraciones, la más reciente primero

### Requirement: Origen IA conservado al editar
Una configuración creada por el asistente SHALL tener origen `IA` con el presupuesto y el uso de la consulta. Al reemplazar sus productos con `PATCH /configuraciones/:id`, MUST conservar el origen, el presupuesto y el uso, y volver a validarse con el motor de reglas, que informa el motivo de cada rechazo.

#### Scenario: Cambio de componente
- **WHEN** el cliente reemplaza la tarjeta gráfica de una configuración recomendada
- **THEN** la configuración sigue con origen `IA`, presupuesto y uso, y su estado refleja la nueva validación

#### Scenario: Cambio incompatible
- **WHEN** el cliente reemplaza la placa por una de otro socket
- **THEN** la respuesta incluye el rechazo de socket con su motivo y la configuración queda `INVALIDA`, sin dejar de ser de origen `IA`
