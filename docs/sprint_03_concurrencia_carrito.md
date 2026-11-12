# Sprint 3: Concurrencia y carrito (semana 4)

> Contexto previo: `00_parte_tecnica.md` (sección 5, reglas de concurrencia, es obligatoria). Implementa solo lo de este documento.

**Objetivo:** reservas atómicas sin sobreventa, expiración, reconciliación e idempotencia. **Es el sprint más importante del proyecto.**
**Depende de:** Sprint 2 (motor de reglas, configuraciones guardadas) y Sprint 1 (catálogo, stock con versión), y de la decisión del caché registrada en `docs/compatibilidad-cloudflare.md` (Sprint 0).

**Almacén de disponibilidad:** el Durable Object `Inventario` con SQLite (opción B, elegida en el Sprint 0; sección 5.2 de `00_parte_tecnica.md`), con sus métodos `reservar`, `expirar`, `cerrar`, `reconstruir` y `consultar`. El prototipo del Sprint 0 ya implementa `reservar` (todo o nada), `expirar`, `reconstruir` y `consultar`, con pruebas en workerd. Todo el acceso pasa por el puerto `DisponibleService`.

## Decisiones tomadas al planificar e implementar (2026-11-11)

Detalle en `openspec/changes/sprint-3-concurrencia-carrito/`.

| Tema | Decisión |
|---|---|
| Qué se reserva | Todo el carrito, con las configuraciones expandidas a sus productos. **Una reserva activa por cliente**: reservar de nuevo libera la anterior |
| Tras reservar | Cuenta regresiva, "Pagar" como "Disponible pronto" (Sprint 4) y "Cancelar reserva" (`DELETE /reservas/:id`), que devuelve el stock en el momento |
| Revalidación | La compatibilidad de una configuración se revalida al agregarla al carrito, no al reservar |
| Confirmación | Servicio expuesto por RPC interno del Worker (sin ruta HTTP), para que lo use el pago del Sprint 4. Margen de 30 s antes del vencimiento |
| Reconciliación | Cuenta las reservas dentro del Durable Object para no pisar una reserva en vuelo |
| Prueba k6 | `tests/k6/preparar.mjs` inserta las sesiones directamente en la base, por el límite de 5 registros por hora por IP. En local, Postgres necesita `max_connections=400` (docker-compose) porque sin Hyperdrive cada petición abre su conexión |

## HU-16 Agregar al carrito
**Como** cliente, **quiero** agregar al carrito una configuración o productos sueltos, **para** comprarlos juntos.

**Criterios de aceptación**
- Se puede agregar una configuración validada completa o productos individuales.
- Una configuración incompatible no se agrega (se revalida al agregar).
- Puedo quitar elementos o cambiar cantidades.
- El carrito muestra el total actualizado.

**Tareas:** módulo `carrito/`, `GET/POST/PATCH/DELETE /carrito`, revalidación con el motor, pantalla de carrito.

## HU-17 Reserva temporal atómica de stock
**Como** cliente, **quiero** que se reserve el stock al iniciar el pago, **para** completar la compra sin que me lo quiten.

**Criterios de aceptación**
- Una única llamada al método `reservar` del Durable Object verifica todos los productos y descuenta todos o ninguno.
- Si falta alguno, no se descuenta nada y se informa cuál faltó.
- La reserva tiene TTL (10 min, configurable) y se registra en Postgres con estado ACTIVA.
- Se muestra el tiempo restante al cliente.

**Tareas:** `POST /reservas` sobre el método `reservar` del Durable Object (tablas SQLite `disponible`, `reservas` y `reserva_items`), registro en `reservas` y `reserva_items` de Postgres. Si el disponible de un producto no existe en el objeto, `reservar` devuelve `NO_INICIALIZADO` (nunca lo trata como cero) y la API lo reconstruye desde Postgres con `reconstruir` y reintenta. Medido en el Sprint 0: 1 subrequest y 4 filas escritas por reserva de un producto.

## HU-18 Liberación automática de reservas expiradas
**Como** cliente, **quiero** que el stock no pagado se libere solo, **para** que otros puedan comprarlo.

**Criterios de aceptación**
- Reserva vencida: las cantidades vuelven al disponible y la reserva pasa a EXPIRADA en Postgres.
- La expiración corre cada minuto (Cron Trigger de Cloudflare) **y antes de cada intento de reserva**.
- Pagar con una reserva expirada informa al usuario y permite reintentar la reserva.

**Tareas:** método `expirar` del Durable Object, handler `scheduled` ejecutado por el Cron Trigger de cada minuto (no `@nestjs/schedule`), llamada previa dentro de `reservar`, sincronización del estado en Postgres.

## HU-19 Sin sobreventa bajo alta demanda
**Como** administrador, **quiero** que un componente limitado nunca se venda más veces que sus unidades, **para** no vender lo que no existe.

**Criterios de aceptación**
- Con 300 intentos simultáneos sobre 5 unidades, exactamente 5 reservas son exitosas.
- Las órdenes confirmadas nunca superan el stock; el stock físico nunca es negativo.
- La confirmación usa actualización condicional con verificación de versión.

**Tareas:** servicio `confirmar` como transacción Postgres (`UPDATE stock SET cantidad = cantidad - n, version = version + 1 WHERE producto_id = X AND cantidad >= n AND version = v`), cierre de la reserva en el Durable Object (método `cerrar`) sin devolver stock, pruebas de integración concurrentes.
*Nota:* el endpoint de pago que invoca `confirmar` se construye en el Sprint 4; aquí se expone el servicio y se prueba directamente.

## HU-20 Confirmación idempotente
**Como** cliente, **quiero** que un reintento de red no duplique mi compra, **para** no pagar dos veces.

**Criterios de aceptación**
- La confirmación exige `Idempotency-Key`.
- Un reintento con la misma clave devuelve la orden original.
- Restricción de unicidad en `ordenes.clave_idempotencia`.

**Tareas:** validación del encabezado, manejo del error de unicidad devolviendo la orden existente, pruebas.

## HU-35 Reconciliación entre el almacén de disponibilidad y Postgres
**Como** desarrollador, **quiero** recalcular el disponible desde Postgres, **para** recuperarme de pérdidas de datos en el almacén de disponibilidad.

**Criterios de aceptación**
- Cron Trigger periódico (cada 5 minutos): disponible = stock físico − reservas ACTIVAS; corrige el Durable Object si difiere.
- Si el disponible de un producto no existe en el objeto (almacenamiento vacío o borrado), se reconstruye desde Postgres con `reconstruir`, que no sobrescribe uno existente, antes de leerlo o reservarlo. No se depende de un arranque de la API: en Workers cada instancia arranca por separado.
- Tras vaciar el almacenamiento del objeto, el disponible vuelve a ser correcto sin intervención manual.

**Tareas:** `ReconciliacionService` con reconstrucción perezosa por producto y un handler `scheduled` para el Cron Trigger periódico (sin hook `onModuleInit`), implementar `DisponibleService` (punto de extensión del Sprint 1) leyendo del Durable Object y conectarlo al catálogo.

## HU-37a Primera prueba de carga k6 (local)
**Como** desarrollador, **quiero** un escenario k6 base, **para** demostrar la consistencia temprano.

**Criterios de aceptación**
- 300 usuarios virtuales intentan reservar el mismo componente de 5 unidades.
- Verificaciones: reservas exitosas == 5; ninguna orden por encima del stock; stock físico ≥ 0.

**Tareas:** `tests/k6/reserva_concurrente.js`, script de preparación del escenario, ejecución local con `wrangler dev`, contra el Durable Object local de Wrangler. Una sola corrida contra producción para medir la latencia real, lanzada contra `*.workers.dev`: en el Sprint 0, 300 peticiones simultáneas desde una sola IP recibieron 429 del borde de Cloudflare en `api.xdtech.store`. Así también se cuidan las 100.000 filas escritas por día.

## Definición de hecho del sprint
Reservas atómicas funcionando, expiración y reconciliación operativas, prueba k6 local pasa sin sobreventa.
