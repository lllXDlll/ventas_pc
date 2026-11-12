# Proposal

## Why

Un componente limitado no puede venderse más veces que sus unidades, aunque cientos de clientes lo intenten a la vez. Este es el objetivo central de la asignatura y el sprint más importante del proyecto (`docs/sprint_03_concurrencia_carrito.md`).

El Sprint 0 validó el almacén de disponibilidad, el Durable Object `Inventario`, con 300 reservas concurrentes sobre 5 unidades que dieron exactamente 5. Sin embargo, todavía nada lo usa: el catálogo muestra el stock físico, los crons de expiración y reconciliación están vacíos, y no existen ni el carrito ni las reservas.

## What Changes

**Carrito (HU-16)**
- **Endpoints:** `GET`, `POST`, `PATCH` y `DELETE` de `/carrito`, con sesión y un carrito por usuario.
- **Contenido:** productos sueltos o configuraciones guardadas. Una configuración se revalida con el motor al agregarla y no se agrega si es incompatible.
- **Edición:** se pueden quitar ítems y cambiar cantidades, y el total se recalcula con los precios vigentes.
- **Pantalla `/carrito`:** los botones "Añadir al carrito" del catálogo, del detalle y del armador, que hasta ahora decían "Disponible pronto", pasan a funcionar.

**Reservas (HU-17, HU-18 y HU-20)**
- **`POST /reservas` reserva todo el carrito.** Las configuraciones se expanden a sus productos y se suman las cantidades repetidas.
  - Usa **una sola** llamada atómica a `reservar` del Durable Object: se descuenta todo o nada y, si falta algo, informa qué producto falta.
  - Si un producto no está inicializado (`NO_INICIALIZADO`), la API lo reconstruye desde Postgres y reintenta una vez.
  - Registra la reserva en Postgres como `ACTIVA`, con un TTL de 10 minutos configurable con `RESERVA_TTL_MIN`.
  - Hay **una reserva activa por cliente**: si ya tenía una, se libera antes de crear la nueva (decisión del desarrollador).
- **`GET /reservas/activa`:** devuelve la reserva vigente con su vencimiento, para la cuenta regresiva.
- **`DELETE /reservas/:id`:** cancela la reserva y devuelve el stock al disponible en el momento (decisión del desarrollador).
- **Expiración:** corre cada minuto con el Cron Trigger y antes de cada reserva, dentro de `reservar`. Las vencidas vuelven al disponible y pasan a `EXPIRADA` en Postgres.
- **`ConfirmacionService.confirmar(reservaId, claveIdempotencia)` (HU-19 y HU-20).** Es solo un servicio, porque el endpoint de pago llega en el Sprint 4. Hace una transacción Postgres:
  - descuenta el stock físico con `UPDATE … WHERE cantidad >= n AND version = v`;
  - crea la orden y el comprobante, y marca la reserva `CONFIRMADA`;
  - después cierra la reserva en el almacén **sin devolver stock**.

  Con la misma clave devuelve la orden original. Con una reserva expirada lo informa.

**Disponibilidad y reconciliación (HU-35)**
- **`DisponibleService` lee del Durable Object.** Hasta ahora devolvía el stock físico. Usa una sola llamada para todos los productos de una página, con reconstrucción perezosa de los que no existan.
- **Catálogo:** muestra el disponible real (stock físico − reservas activas).
- **Cron de reconciliación cada 5 minutos:** corrige el almacén cuando difiere de "stock físico − reservas activas". El cálculo de las reservas activas se hace dentro del objeto, para no pisar una reserva en curso (ver design).

**Prueba de carga (HU-37a)**
- **`tests/k6/reserva_concurrente.js`:** 300 usuarios virtuales reservan un producto de 5 unidades. Exactamente 5 tienen éxito, ninguna orden supera el stock y el stock físico queda ≥ 0.
- **Script de preparación:** crea las cuentas y el producto del escenario.
- **Corridas:** en local con `wrangler dev`, y una sola vez contra `*.workers.dev` para medir la latencia real.

Fuera de este cambio:
- el endpoint de pago y la pantalla de pago (Sprint 4);
- las notificaciones y el historial (Sprint 4);
- el asistente de IA (Sprint 5).

## Capabilities

### New Capabilities

- `carrito`: carrito del usuario con productos y configuraciones, revalidación al agregar, cantidades, total y su pantalla.
- `reservas`: reserva atómica del carrito con TTL, una por cliente, cancelación, expiración, confirmación con descuento condicional e idempotencia, y la prueba de concurrencia.
- `disponibilidad`: lectura del disponible desde el almacén, reconstrucción perezosa por producto y reconciliación periódica con Postgres.

### Modified Capabilities

- `catalogo`: la disponibilidad que se muestra pasa a ser la del almacén (stock físico − reservas activas).
- `tareas-programadas`: la expiración y la reconciliación dejan de estar vacías.
- `armador`: "Agregar al carrito" funciona cuando la configuración es agregable.
- `sistema-diseno`: el carrito deja de ser una acción de un sprint futuro.

## Impact

- **`apps/api`:**
  - `reservas/`: `Inventario` gana `consultarVarios`, `liberar` y `reconciliar`; se agregan `DisponibleService` sobre el objeto, `ReservasService`, `ConfirmacionService` y `ReconciliacionService`;
  - módulo `carrito/`;
  - las tareas `expirar` y `reconciliar` en `worker.ts`;
  - la variable `RESERVA_TTL_MIN`.
  - Las tablas ya existen desde el Sprint 0, así que no hay migración de esquema.
- **`apps/web`:**
  - `features/carrito` y la ruta `/carrito`;
  - los botones de carrito del catálogo, el detalle y el armador;
  - el contador de la cabecera.
- **Pruebas:**
  - unitarias del objeto en workerd: `liberar`, `reconciliar` y `consultarVarios`;
  - de integración: carrito, reservas, confirmación concurrente, idempotencia, expiración y reconciliación tras vaciar el objeto;
  - e2e: carrito y reserva con su cuenta regresiva;
  - k6.
- **Cuotas:** cada reserva escribe 2 + 2·N filas en el objeto (con un límite de 100.000 al día) y hace 1 subrequest. La corrida de k6 contra producción usa `workers.dev`, porque el borde de Cloudflare responde 429 a 300 peticiones desde una sola IP en `api.xdtech.store`.
