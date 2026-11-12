# motor-compatibilidad Specification

## Purpose
Decide si un conjunto de componentes es compatible aplicando seis reglas determinísticas con parámetros en la base de datos, y explica cada incompatibilidad para que el cliente pueda corregirla. Lo usan el armador manual, las configuraciones y, más adelante, el carrito y el asistente de IA.

## Requirements

### Requirement: Validación de una configuración
`POST /compatibilidad/validar` SHALL recibir sin sesión una lista de productos con su cantidad y responder si la configuración es compatible y la lista de rechazos. Cada regla MUST evaluarse solo cuando estén presentes los componentes que compara. Un producto inexistente, inactivo o de la categoría EQUIPO_ARMADO MUST responder 400.

#### Scenario: Configuración compatible
- **WHEN** se valida un procesador AM5, una placa AM5 con DDR5, RAM DDR5 dentro de su velocidad, una fuente suficiente y un gabinete que admite la placa
- **THEN** la respuesta indica compatible y no trae rechazos

#### Scenario: Componentes sueltos
- **WHEN** se valida solo un procesador
- **THEN** la respuesta indica compatible, porque ninguna regla tiene los dos componentes que compara

#### Scenario: Producto inválido
- **WHEN** la lista incluye un identificador inexistente o un equipo armado
- **THEN** la API responde 400 y no evalúa reglas

### Requirement: Rechazos con código y mensaje claro
Cada rechazo SHALL incluir el código de la regla, un mensaje en lenguaje claro que nombre los componentes en conflicto y la característica que no coincide, y los identificadores de los productos involucrados. Una regla MAY devolver varios rechazos con el mismo código cuando fallan características distintas.

#### Scenario: Mensaje que nombra el conflicto
- **WHEN** el procesador es LGA1700 y la placa madre es AM5
- **THEN** el rechazo tiene código `SOCKET` y un mensaje que nombra el procesador, la placa y los dos sockets

### Requirement: Regla SOCKET
La regla SOCKET SHALL rechazar cuando el socket del procesador difiere del de la placa madre, sin distinguir mayúsculas.

#### Scenario: Sockets distintos
- **WHEN** el procesador es LGA1700 y la placa es AM5
- **THEN** hay un rechazo `SOCKET`

#### Scenario: Sockets iguales
- **WHEN** el procesador y la placa son AM5
- **THEN** no hay rechazo `SOCKET`

### Requirement: Regla RAM
La regla RAM SHALL rechazar, con el código `RAM`, cuando el tipo de alguna memoria difiere del de la placa madre, cuando su velocidad supera la velocidad máxima de la placa, o cuando el total de módulos (módulos por unidad por cantidad, sumado en todas las memorias) supera el máximo de la placa.

#### Scenario: Tipo no soportado
- **WHEN** la placa es DDR5 y la RAM es DDR4
- **THEN** hay un rechazo `RAM` que nombra ambos tipos

#### Scenario: Velocidad mayor que la soportada
- **WHEN** la placa admite hasta 5600 MHz y la RAM es de 6000 MHz
- **THEN** hay un rechazo `RAM` que nombra ambas velocidades

#### Scenario: Demasiados módulos
- **WHEN** la placa admite 4 módulos y se eligen 3 kits de 2 módulos
- **THEN** hay un rechazo `RAM` que indica 6 módulos frente a un máximo de 4

### Requirement: Regla POTENCIA
La regla POTENCIA SHALL rechazar cuando el consumo estimado más el margen supera la potencia entregada por la fuente. El consumo estimado es la suma del consumo de procesador y tarjeta gráfica por su cantidad más un consumo base. El margen (por defecto 20 %) y el consumo base (por defecto 0 W) MUST leerse de los parámetros de la regla. El rechazo MUST indicar el consumo calculado con margen y la potencia disponible.

#### Scenario: Fuente insuficiente
- **WHEN** el procesador consume 125 W, la tarjeta 263 W y la fuente entrega 400 W
- **THEN** hay un rechazo `POTENCIA` que indica 466 W requeridos (388 W más 20 %) frente a 400 W disponibles

#### Scenario: Dentro del margen
- **WHEN** el consumo con margen es menor o igual a la potencia de la fuente
- **THEN** no hay rechazo `POTENCIA`

#### Scenario: Margen configurado
- **WHEN** el parámetro de margen de la regla se cambia a 30 %
- **THEN** el cálculo usa 30 % sin cambiar el código

### Requirement: Regla DIMENSIONES
La regla DIMENSIONES SHALL rechazar cuando el largo de la tarjeta gráfica supera el largo máximo de GPU del gabinete, y cuando el procesador declara el alto de su disipador y este supera el alto máximo del gabinete. Sin el alto del disipador, solo se compara la tarjeta gráfica.

#### Scenario: GPU demasiado larga
- **WHEN** la tarjeta mide 320 mm y el gabinete admite 300 mm
- **THEN** hay un rechazo `DIMENSIONES` que nombra ambas medidas

#### Scenario: Disipador demasiado alto
- **WHEN** el disipador del procesador mide 170 mm y el gabinete admite 160 mm
- **THEN** hay un rechazo `DIMENSIONES` por el disipador

#### Scenario: Procesador sin alto de disipador
- **WHEN** el procesador no declara el alto de su disipador
- **THEN** DIMENSIONES no evalúa el disipador

### Requirement: Regla FACTOR_FORMA
La regla FACTOR_FORMA SHALL rechazar cuando el factor de forma de la placa madre no está entre los soportados por el gabinete, sin distinguir mayúsculas.

#### Scenario: Placa ATX en gabinete mATX
- **WHEN** la placa es ATX y el gabinete solo admite mATX e ITX
- **THEN** hay un rechazo `FACTOR_FORMA`

### Requirement: Regla ALMACENAMIENTO
La regla ALMACENAMIENTO SHALL rechazar cada unidad de almacenamiento cuya interfaz no esté entre las interfaces de almacenamiento de la placa madre.

#### Scenario: Interfaz no disponible
- **WHEN** la placa solo ofrece SATA y se elige una unidad M.2
- **THEN** hay un rechazo `ALMACENAMIENTO` que nombra la unidad y la interfaz

### Requirement: Reglas configurables en la base
Las reglas SHALL leer sus parámetros y su estado activo de la tabla de reglas de compatibilidad. Una regla inactiva MUST NOT evaluarse. Una semilla idempotente MUST cargar las seis reglas con sus parámetros por defecto sin pisar parámetros ya ajustados.

#### Scenario: Regla desactivada
- **WHEN** la regla SOCKET está inactiva y los sockets difieren
- **THEN** no hay rechazo `SOCKET`

#### Scenario: Semilla repetida
- **WHEN** se ejecuta la semilla de reglas dos veces después de cambiar el margen a 25 %
- **THEN** existen las seis reglas y el margen sigue en 25 %
