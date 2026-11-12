# Spec Delta

## Purpose

Permite que un cliente pague su reserva activa con un servicio de pago simulado y que, solo si el pago se aprueba, la reserva se confirme como compra, sin cobrar dos veces ante reintentos.

## ADDED Requirements

### Requirement: Resultado del pago simulado
El pago simulado SHALL decidir el resultado por el número de tarjeta: `4242 4242 4242 4242` y cualquier otro número que cumpla Luhn aprueban, salvo `4000 0000 0000 0002`, que rechaza. Un número que no cumple Luhn, un vencimiento pasado o un CVV que no tenga 3 o 4 dígitos MUST responder 400 sin intentar el pago. Una variable de entorno SHALL poder forzar aprobar o rechazar para las pruebas.

#### Scenario: Tarjeta aprobada
- **WHEN** se paga con `4242 4242 4242 4242`, vencimiento futuro y CVV `123`
- **THEN** el pago se aprueba

#### Scenario: Tarjeta rechazada
- **WHEN** se paga con `4000 0000 0000 0002`
- **THEN** el pago se rechaza

#### Scenario: Número inválido
- **WHEN** se paga con `4242 4242 4242 4241`, que no cumple Luhn
- **THEN** la API responde 400 y no se intenta el pago

#### Scenario: Resultado forzado
- **WHEN** el entorno fuerza rechazar y se paga con `4242 4242 4242 4242`
- **THEN** el pago se rechaza

### Requirement: Confirmar el pago
`POST /pagos/confirmar` SHALL recibir la reserva y los datos de tarjeta de un usuario con sesión, con el encabezado `Idempotency-Key`. Si el pago se aprueba, MUST confirmar la reserva, vaciar el carrito del cliente en la misma transacción y devolver 201 con la orden y su número de comprobante. Sin sesión MUST responder 401, y sin `Idempotency-Key` (de 8 a 100 caracteres), 400.

#### Scenario: Pago aprobado
- **WHEN** un cliente con una reserva activa de 2 unidades paga con una tarjeta aprobada
- **THEN** recibe 201 con la orden y el comprobante, el stock físico baja en 2, la reserva queda `CONFIRMADA` y su carrito queda vacío

#### Scenario: Sin clave de idempotencia
- **WHEN** se llama sin `Idempotency-Key`
- **THEN** la API responde 400 y no se crea ninguna orden

### Requirement: Reintento idempotente del pago
Un reintento de `POST /pagos/confirmar` con una `Idempotency-Key` que ya produjo una orden SHALL devolver esa misma orden sin intentar el pago de nuevo ni descontar stock. Si la clave pertenece a otra compra, MUST responder 409.

#### Scenario: Reintento de red
- **WHEN** el cliente repite el mismo pago con la misma clave después de una respuesta perdida
- **THEN** recibe la misma orden y el stock se descontó una sola vez

#### Scenario: Pagos simultáneos con la misma clave
- **WHEN** llegan a la vez dos pagos de la misma reserva con la misma clave
- **THEN** existe una sola orden y ambos reciben esa orden

### Requirement: Pago rechazado conserva la reserva
Si el pago se rechaza, la API SHALL responder 402 con el código `PAGO_RECHAZADO`, MUST NOT crear orden ni descontar stock, y la reserva MUST seguir `ACTIVA` hasta su vencimiento para que el cliente pueda reintentar el pago.

#### Scenario: Rechazo y reintento
- **WHEN** un cliente paga con `4000 0000 0000 0002` y luego, antes del vencimiento, con `4242 4242 4242 4242`
- **THEN** el primer intento recibe 402 y la reserva sigue activa, y el segundo confirma la compra

### Requirement: Pago sin reserva vigente
Si la reserva no existe, no es del usuario, expiró o vence en menos de 30 segundos, la API SHALL responder 409 con el código `RESERVA_EXPIRADA` antes de intentar el pago, sin crear orden.

#### Scenario: Reserva expirada
- **WHEN** un cliente paga una reserva `EXPIRADA`
- **THEN** recibe 409 `RESERVA_EXPIRADA` y no se crea ninguna orden

#### Scenario: Reserva ajena
- **WHEN** un cliente paga la reserva de otro usuario
- **THEN** recibe 409 `RESERVA_EXPIRADA` y la reserva del otro no cambia

### Requirement: Datos de tarjeta no persistidos
El número completo, el vencimiento y el CVV MUST NOT guardarse en la base ni escribirse en los logs. Solo los 4 últimos dígitos SHALL quedar en el comprobante.

#### Scenario: Revisión de lo guardado
- **WHEN** se confirma un pago con `4242 4242 4242 4242`
- **THEN** ninguna tabla ni log contiene el número completo ni el CVV, y el comprobante indica la tarjeta terminada en `4242`

### Requirement: Pantalla de pago
La ruta `/pago` SHALL mostrar a un cliente con reserva activa la cuenta regresiva, el resumen con el total y un formulario de tarjeta que indica las tarjetas de prueba. Al aprobarse, MUST llevar al comprobante. Al rechazarse, MUST indicarlo y permitir reintentar mientras la reserva siga vigente. Sin reserva activa MUST ofrecer volver al carrito.

#### Scenario: Pago desde la pantalla
- **WHEN** un cliente con reserva activa completa el formulario con `4242 4242 4242 4242` y pulsa "Pagar"
- **THEN** ve su comprobante con el número correlativo

#### Scenario: Rechazo en pantalla
- **WHEN** paga con `4000 0000 0000 0002`
- **THEN** ve que el pago fue rechazado, la cuenta regresiva sigue y puede reintentar

#### Scenario: Doble clic
- **WHEN** el cliente pulsa "Pagar" dos veces seguidas
- **THEN** se envía una sola petición, o ambas con la misma clave, y existe una sola orden
