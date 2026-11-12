# Spec Delta

## MODIFIED Requirements

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
