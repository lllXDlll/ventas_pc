# asistente Specification

## Purpose
Recomienda al cliente una configuración de PC completa y compatible según su presupuesto y su uso, con una explicación por componente, validada siempre por el motor de reglas y con un respaldo determinístico que garantiza una respuesta válida aunque la IA falle.

## Requirements

### Requirement: Solicitar una recomendación
`POST /asistente/recomendar` SHALL recibir de un usuario con sesión un presupuesto en soles (de 1 a 100000) y un uso (`OFICINA`, `ESTUDIO`, `GAMING`, `DISENO` u `OTRO`). Responde 201 con la configuración recomendada, guardada con origen `IA`, su presupuesto y su uso. Sin sesión MUST responder 401, y con datos inválidos, 400.

#### Scenario: Recomendación para gaming
- **WHEN** un cliente pide una recomendación con presupuesto 6000 y uso `GAMING`
- **THEN** recibe 201 con una configuración de origen `IA` que tiene una explicación por componente

#### Scenario: Uso inválido
- **WHEN** se envía el uso `MINERIA`
- **THEN** la API responde 400 y no se llama al modelo

### Requirement: Solo componentes disponibles dentro del presupuesto
La recomendación SHALL usar solo productos activos con disponible suficiente en el momento de la consulta. Su total a precios vigentes MUST NOT superar el presupuesto.

#### Scenario: Producto agotado
- **WHEN** el procesador más adecuado para el presupuesto tiene disponible 0
- **THEN** la recomendación no lo incluye

#### Scenario: Total dentro del presupuesto
- **WHEN** el presupuesto es 3500
- **THEN** el total de la configuración recomendada es menor o igual a 3500

### Requirement: Configuración completa y compatible
Toda configuración recomendada SHALL tener exactamente un procesador, una placa madre, una tarjeta gráfica, una fuente, un gabinete, al menos un módulo de RAM y al menos un almacenamiento, y el motor de reglas MUST no encontrarle rechazos antes de mostrarla.

#### Scenario: Recomendación revisada por el motor
- **WHEN** se obtiene una recomendación, venga de la IA o del respaldo
- **THEN** está completa, su estado es `VALIDA` y es agregable al carrito

### Requirement: Presupuesto insuficiente
Si el presupuesto no alcanza para ninguna configuración completa y compatible con el stock disponible, la API SHALL responder 422 con el código `PRESUPUESTO_INSUFICIENTE` y el presupuesto mínimo posible, sin llamar al modelo y sin contar la consulta para el límite.

#### Scenario: Presupuesto muy bajo
- **WHEN** un cliente pide una recomendación con presupuesto 300
- **THEN** recibe 422 con el mínimo necesario, y sus consultas restantes no cambian

### Requirement: Explicación por componente
Cada componente recomendado SHALL incluir una explicación breve (hasta 300 caracteres) ligada al uso y al presupuesto. La respuesta del modelo MUST recibirse como JSON estructurado y validarse contra un esquema antes de mostrarse; una respuesta que no cumple el esquema se trata como inválida.

#### Scenario: Explicaciones del modelo
- **WHEN** la IA responde con un JSON válido
- **THEN** cada componente de la recomendación trae la explicación que dio el modelo

#### Scenario: JSON mal formado
- **WHEN** el modelo devuelve un JSON sin la explicación de un componente
- **THEN** la respuesta se considera inválida y se reintenta

### Requirement: Reintento único con los motivos
Si la respuesta de la IA no cumple el esquema, usa productos que no son candidatos, está incompleta, supera el presupuesto o tiene rechazos del motor, el asistente SHALL reintentar **una sola vez**, enviando al modelo los motivos. No hay un segundo reintento.

#### Scenario: Incompatible y luego válida
- **WHEN** la IA devuelve primero una placa de otro socket y en el reintento una configuración compatible
- **THEN** el cliente recibe la segunda, sin usar el respaldo, y el modelo se llamó dos veces

#### Scenario: Dos respuestas incompatibles
- **WHEN** la IA devuelve dos veces una configuración incompatible
- **THEN** se usa el respaldo determinístico y el modelo se llamó exactamente dos veces

### Requirement: Respaldo determinístico
Si el reintento falla, la API de IA no responde dentro del timeout configurado, devuelve un error (incluido el 429 del gateway) o rechaza la consulta, o el asistente está apagado o sin configurar, el asistente SHALL armar la configuración con el armador determinístico del perfil de uso. Sus explicaciones salen de plantillas. La respuesta MUST indicar que se usó el respaldo.

#### Scenario: IA caída
- **WHEN** la API de IA responde con un error
- **THEN** el cliente recibe una configuración válida marcada como respaldo

#### Scenario: Timeout
- **WHEN** la API de IA no responde dentro del timeout
- **THEN** el cliente recibe una configuración válida del respaldo y la espera total no supera el timeout más un margen de 2 segundos por intento

#### Scenario: Perfil de uso
- **WHEN** el respaldo arma una configuración para `GAMING` y otra para `OFICINA` con el mismo presupuesto
- **THEN** la de `GAMING` dedica a la tarjeta gráfica una parte del total mayor que la de `OFICINA`

### Requirement: Límite de consultas por usuario
Cada usuario SHALL poder hacer como máximo `ASISTENTE_LIMITE_24H` consultas (10 por defecto) en las últimas 24 horas, contadas desde los registros de uso en Postgres y nunca en memoria. Dos consultas simultáneas MUST NOT superar el límite. Al superarlo, la API MUST responder 429 con el código `LIMITE_ASISTENTE` y la hora en que vuelve a haber cupo, sin llamar al modelo.

#### Scenario: Undécima consulta
- **WHEN** un cliente con 10 consultas en las últimas 24 horas pide otra
- **THEN** recibe 429 con la hora de la próxima consulta disponible y el modelo no se llama

#### Scenario: Consultas simultáneas en el límite
- **WHEN** un cliente con 9 consultas envía dos a la vez
- **THEN** una se atiende y la otra recibe 429

### Requirement: Consultas restantes
`GET /asistente/limite` SHALL devolver al usuario con sesión el límite, las consultas usadas en las últimas 24 horas y, si no le quedan, desde cuándo vuelve a tener cupo.

#### Scenario: Después de una consulta
- **WHEN** un cliente sin consultas previas hace una y luego pide su límite
- **THEN** recibe 1 usada de 10

### Requirement: Registro de cada consulta
Cada consulta atendida o fallida SHALL quedar registrada con el usuario, el presupuesto, el uso, el resultado (configuración, explicaciones o motivo del fallo), la latencia en milisegundos y si se usó el respaldo.

#### Scenario: Consulta con respaldo
- **WHEN** una consulta termina en el respaldo porque la IA no respondió
- **THEN** su registro tiene el respaldo marcado, la latencia medida y el motivo

### Requirement: Proveedor de IA intercambiable
El acceso al modelo SHALL ir detrás de una interfaz de proveedor, elegida por configuración, con un adaptador para Claude y uno simulado para las pruebas. Las llamadas a Claude MUST pasar por AI Gateway de Cloudflare autenticado. La clave de Anthropic queda guardada en el gateway; la URL y el token del gateway se leen de secretos y MUST NOT aparecer en el repositorio, en los logs ni en las respuestas.

#### Scenario: Pruebas sin red
- **WHEN** las pruebas y la CI corren con el proveedor simulado
- **THEN** ninguna llama a la API real de Claude

#### Scenario: Sin configuración del gateway
- **WHEN** el proveedor es el de Claude pero falta la URL o el token del gateway
- **THEN** cada consulta usa el respaldo y ningún secreto aparece en un mensaje

#### Scenario: Llamada por el gateway
- **WHEN** el proveedor de Claude hace una consulta
- **THEN** la petición va a la URL del gateway con el encabezado `cf-aig-authorization` y sin clave de Anthropic

### Requirement: Interruptor de la IA
Con `IA_HABILITADA` distinto de `"true"`, el asistente SHALL responder siempre con el respaldo determinístico, sin llamar al gateway, y registrar el motivo `IA_DESACTIVADA`. Las consultas siguen contando para el límite del usuario. La pantalla MUST indicar que la recomendación es de respaldo.

#### Scenario: IA apagada
- **WHEN** `IA_HABILITADA` vale `"false"` y un cliente pide una recomendación
- **THEN** recibe una configuración válida del respaldo, no se hace ninguna llamada al gateway y el registro tiene el motivo `IA_DESACTIVADA`

#### Scenario: Límite global del gateway
- **WHEN** el gateway responde 429 porque se superó su límite de peticiones
- **THEN** el cliente recibe la configuración del respaldo, no un error

### Requirement: Pantalla del asistente
La ruta `/asistente` SHALL pedir presupuesto y uso a un cliente con sesión y mostrar la recomendación: cada componente con su explicación, el total, si se usó el respaldo y las consultas restantes. MUST permitir "Agregar al carrito" y "Editar en el armador". Al superar el límite, MUST mostrar cuándo vuelve a haber cupo. Sin sesión MUST pedir iniciar sesión.

#### Scenario: Recomendación en pantalla
- **WHEN** un cliente envía presupuesto 6000 y uso gaming
- **THEN** ve los 7 componentes con su explicación, el total y sus consultas restantes

#### Scenario: Editar la recomendación
- **WHEN** pulsa "Editar en el armador"
- **THEN** el armador abre la configuración recomendada, indicando que viene del asistente
