# Sprint 4: Pago, notificaciones e historial (semana 5)

> Contexto previo: `00_parte_tecnica.md`. Implementa solo lo de este documento.

**Objetivo:** flujo de compra completo de extremo a extremo.
**Depende de:** Sprint 3 (reservas, servicio `confirmar`, idempotencia, carrito).

## HU-21 Pago simulado
**Como** cliente, **quiero** completar el pago con un servicio simulado, **para** confirmar mi compra.

**Criterios de aceptación**
- Con una reserva activa, el servicio simulado aprueba o rechaza.
- Aprobado: una transacción Postgres descuenta el stock físico, crea la orden y el comprobante y marca la reserva CONFIRMADA.
- Rechazado: la reserva se mantiene hasta su vencimiento y se puede reintentar el pago.

**Tareas:** `pagos/` con `PagoSimuladoService` (resultado configurable para pruebas), `POST /pagos/confirmar` con `Idempotency-Key` que invoca el servicio `confirmar` del Sprint 3, pantalla de pago con cuenta regresiva.

## HU-22 Comprobante de compra
**Como** cliente, **quiero** un comprobante, **para** tener constancia de mi compra.

**Criterios de aceptación**
- Al confirmar la orden se genera un comprobante con número, fecha, detalle y total.
- Se puede consultar desde el historial.

**Tareas:** generación de número correlativo, `GET /comprobantes/:id`, vista imprimible.

## HU-23 Aviso de producto agotado durante la compra
**Como** cliente, **quiero** ser avisado si un producto de mi carrito se agota, **para** reemplazarlo.

**Criterios de aceptación**
- Si al reservar falta un producto, se crea una notificación indicando cuál.
- Puedo ver mis notificaciones y marcarlas como leídas.

**Tareas:** módulo `notificaciones/`, `GET /notificaciones`, `PATCH /notificaciones/:id/leida`, integración con el resultado de la reserva, campana de notificaciones en la interfaz.

## HU-24 Notificación de compra confirmada
**Como** cliente, **quiero** una notificación cuando mi compra se confirme, **para** tener certeza de que se completó.

**Criterios de aceptación**
- Al confirmarse la orden se crea una notificación con el número de comprobante.

**Tareas:** emitir la notificación dentro del flujo de confirmación.

## HU-25 Historial de compras
**Como** cliente, **quiero** consultar mis compras, **para** revisar lo adquirido.

**Criterios de aceptación**
- Lista de mis órdenes (fecha, total, estado), de la más reciente a la más antigua.
- Detalle y comprobante por orden.
- Solo veo mis propias compras.

**Tareas:** `GET /historial/compras`, `GET /historial/compras/:id` filtrados por el usuario autenticado, pantallas.

## HU-26 Historial de configuraciones
**Como** cliente, **quiero** ver mis configuraciones, compradas o no, **para** retomarlas.

**Criterios de aceptación**
- Cada configuración muestra origen (manual o IA), presupuesto, uso, estado y componentes.
- Puedo reabrirla y revalidarla contra el stock y las reglas vigentes.

**Tareas:** `GET /historial/configuraciones`, acción de revalidación, pantalla.

## Definición de hecho del sprint
Un cliente puede armar, reservar, pagar, recibir comprobante y notificaciones, y ver su historial. Prueba e2e del flujo completo.
