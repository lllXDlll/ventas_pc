# reservas Specification

## Purpose
Garantiza que un componente nunca se venda más veces que sus unidades. Reserva el stock de forma atómica durante un tiempo limitado, libera lo no pagado, confirma la venta con una transacción condicional en Postgres y hace que un reintento no duplique la compra.

## Requirements

### Requirement: Reserva atómica del carrito
`POST /reservas` SHALL reservar todo el carrito del cliente con una única operación atómica del almacén de disponibilidad. Las configuraciones se expanden a sus productos y las cantidades repetidas se suman. Si algún producto no tiene disponible suficiente, MUST NOT descontarse nada y la API MUST responder 409 indicando qué producto faltó y su disponible. Un carrito vacío MUST responder 400.

#### Scenario: Reserva exitosa
- **WHEN** un cliente con un carrito de dos productos con stock inicia la compra
- **THEN** la API responde 201 con la reserva, sus productos y su vencimiento, y el disponible de ambos baja en las cantidades reservadas

#### Scenario: Un producto insuficiente
- **WHEN** uno de los dos productos no tiene disponible suficiente
- **THEN** la API responde 409 nombrando ese producto y el disponible de ninguno de los dos cambia

### Requirement: Registro y vencimiento de la reserva
Cada reserva SHALL registrarse en Postgres con estado `ACTIVA`, sus productos y su vencimiento, igual al momento de creación más el TTL configurado (10 minutos por defecto). Si el registro en Postgres falla, la reserva MUST liberarse en el almacén. `GET /reservas/activa` SHALL devolver la reserva vigente del cliente con su vencimiento, o 404 si no tiene.

#### Scenario: Tiempo restante
- **WHEN** un cliente reserva y pide su reserva activa
- **THEN** recibe el vencimiento, 10 minutos después de la creación

### Requirement: Una reserva activa por cliente
Al crear una reserva, si el cliente ya tiene otra activa, la anterior SHALL liberarse antes, devolviendo su stock y quedando `EXPIRADA`. Un cliente MUST NOT tener dos reservas activas a la vez.

#### Scenario: Reservar de nuevo
- **WHEN** un cliente con una reserva activa vuelve a iniciar la compra
- **THEN** la reserva anterior queda `EXPIRADA`, su stock vuelve al disponible y existe una sola reserva activa

### Requirement: Cancelar una reserva
`DELETE /reservas/:id` SHALL liberar una reserva activa del cliente: devuelve su stock al disponible en el momento y la marca `EXPIRADA`. Una reserva ajena o que ya no está activa MUST responder 404.

#### Scenario: Cancelar
- **WHEN** un cliente cancela su reserva activa de 2 unidades
- **THEN** el disponible del producto sube en 2 y la reserva queda `EXPIRADA`

### Requirement: Expiración automática
Las reservas vencidas SHALL devolver sus cantidades al disponible y pasar a `EXPIRADA` en Postgres. La expiración MUST ejecutarse cada minuto y antes de cada intento de reserva.

#### Scenario: Reserva vencida
- **WHEN** vence una reserva de 3 unidades y corre la expiración
- **THEN** el disponible del producto sube en 3 y la reserva queda `EXPIRADA`

#### Scenario: Antes de reservar
- **WHEN** el disponible de un producto está tomado por una reserva vencida y otro cliente intenta reservarlo
- **THEN** la reserva vencida se libera dentro de la misma operación y la nueva tiene éxito

### Requirement: Sin sobreventa bajo concurrencia
Con muchos intentos simultáneos sobre un producto limitado, las reservas exitosas MUST NOT superar sus unidades, las órdenes confirmadas MUST NOT superar el stock y el stock físico MUST NOT quedar negativo.

#### Scenario: 300 intentos sobre 5 unidades
- **WHEN** 300 clientes intentan reservar a la vez una unidad de un producto con 5
- **THEN** exactamente 5 reservas tienen éxito y el resto recibe 409

#### Scenario: Prueba de carga
- **WHEN** se ejecuta el escenario k6 de 300 usuarios virtuales sobre 5 unidades
- **THEN** sus verificaciones informan 5 reservas exitosas, ninguna orden por encima del stock y stock físico ≥ 0

### Requirement: Confirmación con descuento condicional
La confirmación de una reserva activa SHALL ejecutarse en una transacción de Postgres que:
- descuenta el stock físico de cada producto solo si la cantidad alcanza y la versión es la leída (`cantidad >= n AND version = v`), aumentando la versión;
- crea la orden con sus ítems a precio vigente y su comprobante;
- marca la reserva `CONFIRMADA`.

Después, la reserva MUST cerrarse en el almacén sin devolver stock. Si la reserva expiró, la confirmación MUST informarlo sin crear la orden.

#### Scenario: Confirmación
- **WHEN** se confirma una reserva activa de 2 unidades de un producto con stock 5 y versión 3
- **THEN** el stock queda en 3 con versión 4, existe la orden con su comprobante y la reserva está `CONFIRMADA`

#### Scenario: Reserva expirada
- **WHEN** se intenta confirmar una reserva `EXPIRADA`
- **THEN** se informa que expiró, no se crea la orden y el stock físico no cambia

#### Scenario: Versión cambiada
- **WHEN** la versión del stock cambió entre la lectura y la actualización
- **THEN** la transacción reintenta con la versión vigente, sin descontar dos veces

### Requirement: Confirmación idempotente
La confirmación SHALL exigir una clave de idempotencia. Un reintento con la misma clave MUST devolver la orden original sin descontar stock de nuevo, apoyado en la restricción de unicidad de la clave en las órdenes. Sin clave, la confirmación MUST rechazarse.

#### Scenario: Reintento de red
- **WHEN** se confirma dos veces la misma reserva con la misma clave
- **THEN** ambas llamadas devuelven la misma orden y el stock se descuenta una sola vez

#### Scenario: Confirmaciones simultáneas
- **WHEN** dos confirmaciones con la misma clave llegan a la vez
- **THEN** existe una sola orden y ambas devuelven esa orden

### Requirement: Pantalla de reserva
Desde `/carrito`, "Iniciar compra" SHALL reservar y mostrar la cuenta regresiva hasta el vencimiento, el botón "Pagar", que lleva a la pantalla de pago `/pago` (Sprint 4), y el botón "Cancelar reserva". Si falta stock, MUST mostrar qué producto faltó. Al vencer, MUST indicar que la reserva expiró y permitir reservar de nuevo.

#### Scenario: Cuenta regresiva
- **WHEN** un cliente inicia la compra
- **THEN** ve el tiempo restante de su reserva y puede cancelarla

#### Scenario: Reserva vencida en pantalla
- **WHEN** la cuenta regresiva llega a cero
- **THEN** la pantalla indica que la reserva expiró y ofrece reservar de nuevo

#### Scenario: Ir a pagar
- **WHEN** un cliente con una reserva activa pulsa "Pagar"
- **THEN** llega a `/pago` con la misma cuenta regresiva
