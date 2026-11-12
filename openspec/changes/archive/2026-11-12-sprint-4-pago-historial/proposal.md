# Proposal

## Why

Desde el Sprint 3 un cliente puede reservar su carrito, pero la compra no se puede cerrar: el botón "Pagar" dice "Disponible pronto" y `ConfirmacionService` no tiene endpoint. El Sprint 4 (`docs/sprint_04_pago_historial.md`) completa el flujo de extremo a extremo: armar, reservar, pagar, recibir comprobante y notificaciones, y consultar el historial.

## What Changes

**Pago simulado (HU-21)**
- **Módulo `pagos/` con `PagoSimuladoService`.** Decide el resultado con tarjetas de prueba, como las pasarelas en modo prueba (decisión del desarrollador):
  - `4242 4242 4242 4242` aprueba;
  - `4000 0000 0000 0002` rechaza;
  - cualquier otro número válido (Luhn) aprueba, y uno inválido se rechaza con 400;
  - la variable `PAGO_SIMULADO_FORZAR` (`APROBAR` o `RECHAZAR`) fuerza el resultado en las pruebas.
- **Los datos de tarjeta no se guardan ni se registran en logs.** Solo los 4 últimos dígitos quedan en el comprobante.
- **`POST /pagos/confirmar`:**
  - exige sesión, la reserva y el encabezado `Idempotency-Key`;
  - si el pago se aprueba, invoca `ConfirmacionService.confirmar` del Sprint 3;
  - un reintento con la misma clave devuelve la orden original sin cobrar de nuevo;
  - un rechazo responde 402 y la reserva se mantiene hasta su vencimiento, así que el pago se puede reintentar.
- **Pantalla `/pago`:** muestra la cuenta regresiva de la reserva, el resumen y el formulario de tarjeta, con las tarjetas de prueba indicadas. "Pagar" deja de ser "Disponible pronto".

**Comprobante (HU-22)**
- **Número correlativo global `XD-000001`, `XD-000002`…**
  - Lo da una secuencia de Postgres, creada en una migración nueva (decisión del desarrollador).
  - Reemplaza el formato `XD-AAAAMMDD-<id>` del Sprint 3.
  - La migración renumera los comprobantes existentes por fecha.
- **Contenido:** el comprobante guarda una copia del nombre de cada producto, para que no cambie si el producto se edita después.
- **`GET /comprobantes/:id`:** solo para el dueño.
- **Vista imprimible `/cuenta/comprobantes/[id]`.**

**Notificaciones (HU-23 y HU-24)**
- **Módulo `notificaciones/`:**
  - `GET /notificaciones` devuelve las últimas y el número de no leídas;
  - `PATCH /notificaciones/:id/leida` marca una como leída;
  - la notificación de otro usuario responde 404.
- **Producto agotado:** si al reservar falta un producto, se crea una notificación que dice cuál es. Si ya hay una igual sin leer, no se repite.
- **Compra confirmada:** la notificación con el número de comprobante se crea **dentro** de la transacción de confirmación, así que no hay orden sin aviso.
- **Campana en la cabecera:** muestra el contador de no leídas y la lista, y cada notificación se puede marcar como leída.

**Historial (HU-25 y HU-26)**
- **`GET /historial/compras`:** las órdenes del usuario, de la más reciente a la más antigua, con fecha, total, estado y comprobante.
- **`GET /historial/compras/:id`:** el detalle de una orden con sus productos.
  - Una orden de otro usuario responde 404.
  - Una orden solo existe si se pagó, así que su estado es siempre "Pagada" y no se agrega una columna.
- **`GET /historial/configuraciones`:** las configuraciones del usuario, compradas o no, con origen, presupuesto, uso, estado y componentes.
- **`POST /historial/configuraciones/:id/revalidar`:** recalcula la configuración con las reglas y el stock vigentes y guarda el estado.
- **Reabrir:** una configuración se reabre en el armador con `/armador?config=<id>` (Sprint 2).
- **Pantallas `/cuenta/compras`, `/cuenta/compras/[id]` y `/cuenta/configuraciones`,** con accesos "Mis compras" y "Mis configuraciones" en la zona de cuenta.

**Prueba e2e del flujo completo (definición de hecho):** armar, agregar al carrito, reservar, pagar, ver el comprobante y la notificación, y verlo en el historial. También cubre el rechazo con reintento y el aviso de producto agotado.

Fuera de este cambio:
- pasarelas de pago reales y reembolsos (fuera de alcance del proyecto);
- notificaciones por correo (el proyecto no envía correos);
- el asistente de IA (Sprint 5).

## Capabilities

### New Capabilities

- `pagos`: pago simulado con tarjetas de prueba, `POST /pagos/confirmar` idempotente sobre la confirmación, rechazo que conserva la reserva y la pantalla de pago.
- `comprobantes`: numeración correlativa, contenido, consulta del dueño y vista imprimible.
- `notificaciones`: avisos dentro de la aplicación por producto agotado y compra confirmada, su listado, la marca de leída y la campana.
- `historial`: compras y configuraciones del usuario, el detalle de una compra, la revalidación de una configuración y sus pantallas.

### Modified Capabilities

- `reservas`: en la pantalla de reserva, "Pagar" lleva a la pantalla de pago en lugar de decir "Disponible pronto".
- `sistema-diseno`: el pago deja de ser una acción de un sprint futuro.
- `esquema-datos`: la secuencia de números de comprobante.

## Impact

- **`apps/api`:**
  - módulos `pagos/` (`PagoSimuladoService`, `POST /pagos/confirmar` y `GET /comprobantes/:id`), `notificaciones/` e `historial/`;
  - `ConfirmacionService` toma el número de la secuencia y crea la notificación en su transacción;
  - `ReservasService` notifica el producto agotado;
  - la variable `PAGO_SIMULADO_FORZAR`;
  - una migración: la secuencia `comprobante_numero_seq` y la renumeración.
- **`apps/web`:**
  - las funcionalidades `pago`, `notificaciones` e `historial`;
  - las rutas `/pago`, `/cuenta/compras`, `/cuenta/compras/[id]`, `/cuenta/comprobantes/[id]` y `/cuenta/configuraciones`;
  - la campana y los accesos de cuenta en la cabecera;
  - "Pagar" en la reserva.
- **Pruebas:**
  - unitarias del pago simulado (tarjetas, Luhn y forzado);
  - de integración: pago aprobado, rechazado, idempotente y con la reserva expirada; correlativo bajo confirmaciones concurrentes; notificaciones; historial con aislamiento por usuario;
  - e2e del flujo completo, con axe en las pantallas nuevas.
- **Producción:** después de desplegar hay que aplicar la migración en Neon con el mismo procedimiento de los sprints anteriores.
