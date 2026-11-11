# Sprint 3: Concurrencia y carrito (semana 4)

> Contexto previo: `00_parte_tecnica.md` (sección 5, reglas de concurrencia, es obligatoria). Implementa solo lo de este documento.

**Objetivo:** reservas atómicas sin sobreventa, expiración, reconciliación e idempotencia. **Es el sprint más importante del proyecto.**
**Depende de:** Sprint 2 (motor de reglas, configuraciones guardadas) y Sprint 1 (catálogo, stock con versión), y de la decisión del caché registrada en `docs/compatibilidad-cloudflare.md` (Sprint 0).

**Almacén de disponibilidad:** en este sprint "Redis" designa al almacén elegido en el Sprint 0. Con la **opción A** se implementa con Redis en Upstash y scripts Lua (sección 5.1 de `00_parte_tecnica.md`). Con la **opción B** se implementa con el Durable Object `Inventario` y sus métodos `reservar`, `expirar`, `cerrar` y `reconstruir` (sección 5.2). Las reglas de concurrencia de la sección 5 son idénticas en ambos casos. Donde este documento dice "script Lua", con la opción B se entiende "método del Durable Object".

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
- Un único script Lua verifica todos los productos y descuenta todos o ninguno.
- Si falta alguno, no se descuenta nada y se informa cuál faltó.
- La reserva tiene TTL (10 min, configurable) y se registra en Postgres con estado ACTIVA.
- Se muestra el tiempo restante al cliente.

**Tareas:** `reservas/` con `reservar.lua`, estructuras en Redis (`disp:{productoId}`, `reserva:{id}` con TTL, `reservas:vencimientos`), `POST /reservas`, registro en `reservas` y `reserva_items`, con la opción A, cliente HTTP `@upstash/redis` con `eval`/`evalsha` para los scripts (no `ioredis`); con la opción B, el método `reservar` del Durable Object. Si `disp:{productoId}` no existe, el script devuelve "no inicializado" (nunca lo trata como cero) y la API reconstruye ese contador desde Postgres y reintenta.

## HU-18 Liberación automática de reservas expiradas
**Como** cliente, **quiero** que el stock no pagado se libere solo, **para** que otros puedan comprarlo.

**Criterios de aceptación**
- Reserva vencida: las cantidades vuelven al disponible y la reserva pasa a EXPIRADA en Postgres.
- La expiración corre cada minuto (Cron Trigger de Cloudflare) **y antes de cada intento de reserva**.
- Pagar con una reserva expirada informa al usuario y permite reintentar la reserva.

**Tareas:** `expirar.lua`, handler `scheduled` ejecutado por el Cron Trigger de cada minuto (no `@nestjs/schedule`), llamada previa dentro de `reservar`, sincronización del estado en Postgres.

## HU-19 Sin sobreventa bajo alta demanda
**Como** administrador, **quiero** que un componente limitado nunca se venda más veces que sus unidades, **para** no vender lo que no existe.

**Criterios de aceptación**
- Con 300 intentos simultáneos sobre 5 unidades, exactamente 5 reservas son exitosas.
- Las órdenes confirmadas nunca superan el stock; el stock físico nunca es negativo.
- La confirmación usa actualización condicional con verificación de versión.

**Tareas:** servicio `confirmar` como transacción Postgres (`UPDATE stock SET cantidad = cantidad - n, version = version + 1 WHERE producto_id = X AND cantidad >= n AND version = v`), cierre de la reserva en Redis sin devolver stock, pruebas de integración concurrentes.
*Nota:* el endpoint de pago que invoca `confirmar` se construye en el Sprint 4; aquí se expone el servicio y se prueba directamente.

## HU-20 Confirmación idempotente
**Como** cliente, **quiero** que un reintento de red no duplique mi compra, **para** no pagar dos veces.

**Criterios de aceptación**
- La confirmación exige `Idempotency-Key`.
- Un reintento con la misma clave devuelve la orden original.
- Restricción de unicidad en `ordenes.clave_idempotencia`.

**Tareas:** validación del encabezado, manejo del error de unicidad devolviendo la orden existente, pruebas.

## HU-35 Reconciliación entre Redis y Postgres
**Como** desarrollador, **quiero** recalcular el disponible desde Postgres, **para** recuperarme de pérdidas de datos en Redis.

**Criterios de aceptación**
- Cron Trigger periódico (cada 5 minutos): disponible = stock físico − reservas ACTIVAS; corrige Redis si difiere.
- Si el contador de un producto no existe en Redis (Redis vacío o reiniciado), se reconstruye desde Postgres con `SET ... NX` antes de leerlo o reservarlo. No se depende de un arranque de la API: en Workers cada instancia arranca por separado.
- Tras reiniciar Redis, el disponible vuelve a ser correcto sin intervención manual.

**Tareas:** `ReconciliacionService` con reconstrucción perezosa por producto y un handler `scheduled` para el Cron Trigger periódico (sin hook `onModuleInit`), implementar `DisponibleService` (punto de extensión del Sprint 1) leyendo de Redis y conectarlo al catálogo.

## HU-37a Primera prueba de carga k6 (local)
**Como** desarrollador, **quiero** un escenario k6 base, **para** demostrar la consistencia temprano.

**Criterios de aceptación**
- 300 usuarios virtuales intentan reservar el mismo componente de 5 unidades.
- Verificaciones: reservas exitosas == 5; ninguna orden por encima del stock; stock físico ≥ 0.

**Tareas:** `tests/k6/reserva_concurrente.js`, script de preparación del escenario, ejecución local con `wrangler dev`: con la opción A, contra un Redis local accesible por HTTP (por ejemplo el proxy `serverless-redis-http` de Upstash, a validar en el Sprint 0) y no contra Upstash en la nube, para cuidar la cuota de comandos; con la opción B, contra el Durable Object local de Wrangler.

## Definición de hecho del sprint
Reservas atómicas funcionando, expiración y reconciliación operativas, prueba k6 local pasa sin sobreventa.
