# Spec Delta

## Purpose

Avisa al cliente, dentro de la aplicación, de lo que pasa con su compra: cuando un producto de su carrito se agota al reservar y cuando su compra se confirma.

## ADDED Requirements

### Requirement: Aviso de producto agotado al reservar
Si una reserva falla porque falta un producto, SHALL crearse para el cliente una notificación de tipo `PRODUCTO_AGOTADO` que nombra el producto y cuántas unidades quedan. Si el cliente ya tiene una igual sin leer, MUST NOT crearse otra.

#### Scenario: Producto agotado
- **WHEN** un cliente reserva un carrito con 2 unidades de un producto del que quedan 0
- **THEN** la reserva falla y el cliente tiene una notificación no leída con el nombre del producto

#### Scenario: Intento repetido
- **WHEN** el cliente vuelve a intentar la misma reserva sin leer el aviso anterior
- **THEN** sigue teniendo una sola notificación de ese producto

### Requirement: Aviso de compra confirmada
Al confirmarse una orden SHALL crearse, en la misma transacción, una notificación de tipo `COMPRA_CONFIRMADA` con el número de comprobante. Un reintento idempotente MUST NOT crear otra.

#### Scenario: Compra confirmada
- **WHEN** se confirma la compra con comprobante `XD-000007`
- **THEN** el cliente tiene una notificación no leída que menciona `XD-000007`

#### Scenario: Reintento del pago
- **WHEN** el pago se repite con la misma clave
- **THEN** el cliente sigue teniendo una sola notificación de esa compra

### Requirement: Listar notificaciones propias
`GET /notificaciones` SHALL devolver al usuario con sesión sus 20 notificaciones más recientes, primero la última, con tipo, mensaje, fecha y si está leída, junto con el total de no leídas. Sin sesión MUST responder 401.

#### Scenario: Solo las propias
- **WHEN** dos clientes tienen notificaciones y uno pide las suyas
- **THEN** recibe solo las suyas y su número de no leídas

### Requirement: Marcar como leída
`PATCH /notificaciones/:id/leida` SHALL marcar como leída una notificación del usuario y responder con ella. Repetirlo MUST dejarla leída sin error. La notificación de otro usuario MUST responder 404 y no cambiar.

#### Scenario: Marcar
- **WHEN** el cliente marca como leída una notificación suya
- **THEN** queda leída y el número de no leídas baja en 1

#### Scenario: Notificación ajena
- **WHEN** un cliente intenta marcar la notificación de otro
- **THEN** la API responde 404 y la notificación sigue sin leer

### Requirement: Campana de notificaciones
La cabecera SHALL mostrar a un cliente con sesión una campana con el número de no leídas y, al abrirla, la lista de notificaciones, donde cada una se puede marcar como leída. El contador MUST actualizarse después de reservar o pagar sin recargar la página. La campana MUST poder usarse con teclado y no se muestra sin sesión.

#### Scenario: Aviso tras pagar
- **WHEN** un cliente termina un pago aprobado
- **THEN** la campana muestra 1 no leída y, al abrirla, el aviso con el número de comprobante

#### Scenario: Con teclado
- **WHEN** el cliente abre la campana con Enter, recorre la lista con Tab y la cierra con Esc
- **THEN** el foco vuelve a la campana
