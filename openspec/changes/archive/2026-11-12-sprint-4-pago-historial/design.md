# Design

## Context

Al terminar el Sprint 3 existen:
- **`ConfirmacionService.confirmar(usuarioId, reservaId, clave)`** (`apps/api/src/reservas/confirmacion.service.ts`):
  - hace la transacción interactiva con `SELECT … FOR UPDATE` sobre la reserva, el margen de 30 s, el descuento condicional por versión, la orden, sus ítems y el comprobante;
  - es idempotente con `clave_idempotencia` única, el manejo de P2002 y `YaConfirmada`;
  - el Worker la expone por RPC (`Api.confirmar`, sin ruta HTTP).
- **El número de comprobante** hoy es `XD-AAAAMMDD-<6 hex del id>`: es único, pero no correlativo.
- **`ReservasService.reservar`:** cuando falta un producto, responde 409 `SIN_STOCK` con `detalle {productoId, nombre, disponible}`.
- **Las tablas `notificaciones` (`tipo`, `mensaje`, `leida`) y `comprobantes` (`numero` único, `detalle` JSONB)** existen desde la migración inicial, sin uso.
- **`ConfiguracionesService`** ya recalcula con `evaluar` (`detalle` no reescribe el estado) y lista con páginas de `POR_PAGINA`. El armador reabre una configuración con `/armador?config=<id>`.
- **Las carpetas `pagos/`, `notificaciones/` e `historial/`** de la API solo tienen `.gitkeep`.
- **Frontend:**
  - `features/carrito` tiene `useReservaActiva`, `useRestante` y la pantalla de reserva con `<BotonProximamente>Pagar</BotonProximamente>`;
  - `lib/carrito.ts` comparte la clave de consulta y `useAgregarAlCarrito`;
  - la cabecera recibe la cuenta y el contador del carrito como ranuras (`shell.tsx`).
- **Regla de capas:** la lista `FUNCIONALIDADES` de `eslint.config.mjs` no incluye `carrito`.

## Goals / Non-Goals

**Goals:**
- Pagar una reserva con un pago simulado, idempotente, sin cobrar dos veces ni perder la reserva ante un rechazo.
- Comprobante correlativo, consultable e imprimible.
- Notificaciones dentro de la aplicación por producto agotado y compra confirmada, con su campana.
- Historial de compras y de configuraciones, solo con lo propio.
- Prueba e2e del flujo completo.

**Non-Goals:**
- Una pasarela real, reembolsos o la anulación de comprobantes.
- Avisos por correo o push.
- Un estado de orden distinto de "Pagada", y marcar qué configuración se compró: las reservas expanden las configuraciones a productos, así que no hay vínculo entre una orden y una configuración.
- Notificaciones en tiempo real (WebSocket): se consulta al abrir, después de reservar o pagar, y cada 60 s.

## Decisions

### D1. Pago simulado (`pagos/pago-simulado.ts`)

`autorizar(tarjeta, forzar): 'APROBADO' | 'RECHAZADO'` es una función pura, sin E/S ni lectura del entorno (se prueba en Node). `PagosService` le pasa `PAGO_SIMULADO_FORZAR`.

1. **Validación (400 `SOLICITUD_INVALIDA`):**
   - el número tiene de 13 a 19 dígitos, ignorando espacios, y cumple Luhn;
   - el vencimiento `MM/AA` no está en el pasado;
   - el CVV tiene 3 o 4 dígitos;
   - el titular no está vacío.
2. **Forzado:** si `PAGO_SIMULADO_FORZAR` vale `APROBAR` o `RECHAZAR`, ese es el resultado. Su valor por defecto es vacío en `wrangler.jsonc`, y el valor se lee en cada llamada, para poder forzarlo en las pruebas de integración.
3. **Por número:** `4000000000000002` rechaza y cualquier otro número válido aprueba.

Se descartaron los botones aprobar/rechazar porque el usuario eligió tarjetas de prueba. El formulario parece un pago real y es fácil de automatizar.

### D2. `POST /pagos/confirmar` (`PagosController` + `PagosService`)

- **Cuerpo:** `{ reservaId, tarjeta: { numero, vencimiento, cvv, titular } }`.
- **Encabezados:** `Idempotency-Key`, con sesión.

Orden de pasos de `PagosService.pagar`:
1. **Validar la clave** (de 8 a 100 caracteres) y el formato del cuerpo. Si falla, 400.
2. **Si ya existe una orden con esa clave,** se delega en `confirmar`, que devuelve la original o 409 `CLAVE_EN_USO`. **No se vuelve a autorizar.** Así un reintento después de un pago aprobado nunca recibe un rechazo.
3. **Comprobar que la reserva es del usuario, está `ACTIVA` y vence en más de `MARGEN_CONFIRMACION_MS`.** Si no, 409 `RESERVA_EXPIRADA`. Así no se "cobra" una reserva que no se podrá confirmar.
4. **`autorizar(tarjeta)`.** Si rechaza, 402 `PAGO_RECHAZADO` y no se toca la reserva ni la clave: el cliente puede reintentar, con la misma clave o con otra.
5. **`confirmar(usuarioId, reservaId, clave, { ultimos4 })`**, el mismo servicio del Sprint 3. Ahora recibe los 4 últimos dígitos para el comprobante.

Se llama al servicio dentro de Nest y no por el RPC, porque es el mismo proceso. El RPC se mantiene para uso interno.

**Hallazgo de la implementación: transacciones interactivas concurrentes.** Prisma agrupa las consultas de una transacción interactiva (`batchBy: itx-<id>`) y las despacha en un `process.nextTick` compartido por el cliente. Con el `PrismaClient` del isolate, la transacción de una petición se ejecutaba en el contexto de otra y, cuando esa otra terminaba, workerd dejaba colgada su E/S. Con 3 pagos simultáneos de clientes distintos, uno quedaba colgado con la transacción abierta después del `UPDATE stock`. Por RPC no se veía porque las llamadas llegaban en ticks distintos. La confirmación usa `conTransaccion()` (`datos/prisma.ts`): un `PrismaClient` propio por transacción, sobre la conexión de la petición.

**Carrito vacío tras pagar:** la transacción de confirmación borra los ítems del carrito del cliente. Sin eso, la siguiente reserva volvía a incluir lo ya comprado (lo detectó la prueba del historial). Se agregó a la spec de pagos.

La respuesta es 201 con `OrdenConfirmada`, que ahora incluye `comprobanteId` para redirigir a la vista. Un reintento idempotente también responde 201: es el mismo recurso.

Datos sensibles: el DTO de tarjeta no se registra. Los logs de error del filtro global no incluyen el cuerpo (comprobar en `comun/errores.ts`), y la tarjeta no se pasa a `confirmar`, solo los 4 últimos dígitos.

### D3. Comprobante correlativo

- **Migración `comprobantes_correlativo`:**
  - `CREATE SEQUENCE comprobante_numero_seq`;
  - renumera los existentes con `row_number() OVER (ORDER BY fecha, id)` → `'XD-' || lpad(n::text, 6, '0')`. Se hace en dos pasos (primero a un valor temporal) para no chocar con la unicidad;
  - ajusta la secuencia con `setval(…, max, max > 0)`.
- **En la transacción de `confirmar`:** después de crear la orden (donde un P2002 de la clave aborta antes de consumir número), `SELECT nextval('comprobante_numero_seq')` → `XD-` + `lpad(6)`. Pasado `999999`, el número crece a 7 dígitos y el formato `XD-\d{6,}` lo admite.
- **`detalle`** pasa a `{ items: [{ productoId, nombre, cantidad, precioUnitario, subtotal }], total, tarjeta: { ultimos4 } }`. Los comprobantes antiguos no tienen `nombre`, así que la lectura completa con el nombre actual del producto.

Se eligió una secuencia y no una tabla contador porque no serializa las confirmaciones. Su costo es que `nextval` no se deshace si la transacción falla después, y quedaría un hueco. Se minimiza tomándolo lo más tarde posible: después de la orden, antes del comprobante, la notificación y el cambio de estado de la reserva, que no deberían fallar. El riesgo se documenta.

### D4. Notificaciones (`notificaciones/`)

`NotificacionesService`:
- **`crear(cliente, usuarioId, tipo, mensaje)`** acepta el cliente de la transacción (`Prisma.TransactionClient`) o el normal.
- **`crearSiNoHay(usuarioId, tipo, mensaje)`** solo inserta si no existe una igual sin leer. Es un `INSERT … SELECT … WHERE NOT EXISTS`, una sola consulta.
- **`listar(usuarioId)`:** las 20 últimas más el `count` de no leídas.
- **`marcarLeida(usuarioId, id)`:** un `updateMany` con `{ id, usuarioId }`. Si cuenta 0, 404. Un id que no es UUID también da 404.

Tipos: `PRODUCTO_AGOTADO` y `COMPRA_CONFIRMADA` (constantes; la columna es texto).

Integración:
- **`ReservasService.reservar`:** en la rama `INSUFICIENTE`, antes de lanzar el 409, llama a `crearSiNoHay` con «Se agotó «{nombre}»: quedan {n}. Reemplázalo en tu carrito.». Si la notificación falla, se registra en el log, pero no cambia la respuesta 409.
- **`ConfirmacionService`:** `tx.notificacion.create` dentro de la transacción, con «Tu compra se confirmó. Comprobante {numero}.». Los reintentos idempotentes salen antes de la transacción, así que no duplican.

Módulos: `NotificacionesModule` exporta el servicio, y `PedidosModule` lo importa.

### D5. Historial (`historial/`)

`HistorialController` (con sesión) y `HistorialService`:
- **`GET /historial/compras?pagina=`:** `orden.findMany({ where: { usuarioId }, orderBy: [{ creadaEn: 'desc' }, { id: 'desc' }], skip, take: 20 })` con `comprobante { id, numero }` y `_count.items`, más el `count` total. `estado: 'PAGADA'` es fijo (ver Non-Goals).
- **`GET /historial/compras/:id`:** `findFirst({ where: { id, usuarioId } })` con los ítems y el nombre del producto. Si no aparece, 404.
- **`GET /historial/configuraciones?pagina=`:** reutiliza la paginación de `ConfiguracionesService.listar` y agrega `origen`, `presupuesto`, `uso` y los componentes (nombre, categoría, cantidad). Muestra el estado guardado y no recalcula, para que la lista cueste una sola consulta.
- **`POST /historial/configuraciones/:id/revalidar`:** es un `ConfiguracionesService.revalidar(usuarioId, id)` nuevo. Reutiliza `propia` y `evaluar`, guarda el `estado` y devuelve `VistaConfiguracion` (rechazos, `agregable`, `faltantes`). `detalle` sigue sin escribir.

`HistorialModule` importa `ConfiguracionesModule`.

`GET /comprobantes/:id` vive en `pagos/` (`ComprobantesController`). Busca con `findFirst({ where: { id, orden: { usuarioId } } })` e incluye el correo del usuario.

### D6. Frontend

- **Funcionalidades:**
  - El pago vive en **`features/carrito`**, porque comparte `useReservaActiva` y `useRestante` y la regla de capas impide importarlos desde otra funcionalidad.
  - Se crean `features/notificaciones` y `features/historial`. El comprobante vive en `historial`.
  - Se agregan `carrito`, `notificaciones` e `historial` a `FUNCIONALIDADES` en `eslint.config.mjs`.
  - La clave de consulta de las notificaciones va en `lib/notificaciones.ts`, para que `carrito` la invalide después de reservar o pagar sin importar otra funcionalidad.
- **`/pago` (`app/(tienda)/pago/page.tsx`)** usa el contenedor `PagoContenedor`:
  - Sin sesión, redirige a `/ingresar?volver=%2Fpago`. Sin reserva activa, muestra el estado vacío con "Volver al carrito".
  - Muestra la cuenta regresiva y el resumen de la reserva.
  - El formulario es no controlado, para evitar las carreras de hidratación del Sprint 1.5, y tiene `autocomplete="cc-number"` etc. Indica las tarjetas de prueba.
  - **La clave de idempotencia** se genera con `crypto.randomUUID()` al montar y se guarda en una ref.
    - Se conserva entre reintentos de red.
    - Se renueva después de un 402: el pago siguiente es un intento nuevo, y una clave nueva lo deja explícito en el log.
    - El botón se deshabilita mientras la mutación está pendiente.
  - **Al aprobarse:** invalida carrito, reserva y notificaciones, y navega a `/cuenta/comprobantes/[comprobanteId]`.
  - **En la reserva**, "Pagar" pasa a ser un `Link` a `/pago`.
- **Campana (`features/notificaciones`):**
  - el contenedor va como ranura nueva `notificaciones` de `Header`, junto al carrito, y no se muestra sin sesión;
  - un botón con `aria-label` «Notificaciones, N sin leer» abre un popover accesible: `aria-expanded`, foco al primer elemento, Esc cierra y devuelve el foco;
  - cada notificación tiene "Marcar como leída";
  - `useQuery` con `refetchInterval: 60_000` y `refetchOnWindowFocus`.
- **Cuenta:** `MenuCuenta` agrega los enlaces "Mis compras" y "Mis configuraciones" (también en el menú lateral móvil, que reutiliza la ranura `cuenta`).
- **Rutas `app/(tienda)/cuenta/compras`, `compras/[id]`, `comprobantes/[id]` y `configuraciones`:**
  - son de cliente, `robots: noindex` y redirigen sin sesión como `/carrito`;
  - la tabla de compras usa la envoltura `relative overflow-x-auto` de los Sprints anteriores para 360 px;
  - las configuraciones tienen "Revalidar" (muestra rechazos o faltantes en línea) y "Abrir en el armador" (`/armador?config=<id>`).
- **Comprobante imprimible:** estilos `print:` de Tailwind. El `<header>`, el `<footer>` y los botones llevan `print:hidden`, y `window.print()` va detrás del botón "Imprimir". Los colores salen solo de los tokens.

### D7. Pruebas

- **Unitarias (`pago-simulado.test.ts`):** Luhn, tarjetas aprobada y rechazada, vencimiento pasado, CVV y forzado. En el frontend, una configuración mínima de Vitest en Node prueba las funciones puras de formato (tarjeta, contador y fechas).
- **De integración (Node + `createTestHarness`):**
  - pago aprobado: stock, orden, comprobante `XD-\d{6}` y notificación;
  - 402 con la reserva activa y reintento aprobado;
  - reserva expirada o ajena: 409 sin orden;
  - reintento con la misma clave: misma orden y una sola notificación;
  - dos pagos simultáneos con la misma clave;
  - 10 confirmaciones concurrentes con números distintos y consecutivos;
  - notificación de agotado sin duplicado;
  - listar y marcar con aislamiento por usuario;
  - historial con paginación, orden y 404 ajeno;
  - revalidar tras desactivar un producto;
  - `GET /comprobantes/:id` del dueño y ajeno.

  El forzado con `PAGO_SIMULADO_FORZAR` se prueba en las unitarias, porque el arnés fija las variables al arrancar. Las de integración usan las tarjetas de prueba.
- **Migración:** en un esquema de prueba se insertan 3 comprobantes con el formato viejo, se aplica el SQL y se comprueba que quedan `XD-000001…3` y que `nextval` da 4.
- **E2e (Playwright):** el flujo completo de la definición de hecho, `@humo`, pero sin pagar en producción:
  - registrarse;
  - armar una configuración compatible y agregarla al carrito;
  - iniciar la compra y pagar con `4242…`;
  - ver el comprobante, la campana con 1 aviso y la compra en "Mis compras";
  - revalidar y abrir la configuración desde "Mis configuraciones".

  Más: rechazo con `4000…0002` y reintento; aviso de agotado; axe en `/pago`, `/cuenta/*` y la campana abierta; 360 px sin desbordes; impresión con `page.emulateMedia({ media: 'print' })`.
- **Producción:** el `@humo` contra producción solo abre las pantallas nuevas sin pagar, para no crear órdenes reales. El flujo con pago corre en la CI contra la base local.

## Risks / Trade-offs

- **Hueco en la numeración** si la transacción falla después de `nextval` → `nextval` se toma tarde y solo quedan pasos que no deberían fallar. Si aun así aparece un hueco, se ve como un salto y no como un número repetido. Se documenta en `00_parte_tecnica.md`.
- **Pago aprobado y confirmación que falla después** (por ejemplo `SIN_STOCK` por un ajuste del ADMIN) → en una pasarela real habría que reembolsar. Aquí es simulado, así que se responde el error de `confirmar` y no se crea orden. Queda anotado como deuda para una pasarela real.
- **Notificación de agotado fuera de la transacción de la reserva** → si falla, la reserva igual responde 409 y solo se pierde el aviso. Se prefiere a acoplar el aviso con el Durable Object.
- **Una consulta de notificaciones cada 60 s por pestaña** → 2 consultas a Hyperdrive por minuto y cliente activo. Con el tráfico académico está lejos de las 100.000 diarias. Solo se consulta con la pestaña visible (`refetchIntervalInBackground: false`).
- **La renumeración cambia los números de los comprobantes de prueba previos** → en producción solo hay órdenes de prueba del desarrollador. Se acepta.

## Migration Plan

1. Migración `prisma/migrations/<fecha>_comprobantes_correlativo` (secuencia + renumeración), aplicada en local y en la CI.
2. El job `desplegar` aplica las migraciones en Neon antes de publicar la API, como en los sprints anteriores.
3. Variables: `PAGO_SIMULADO_FORZAR` queda vacía en `wrangler.jsonc` (producción decide por número de tarjeta).
4. Rollback: la secuencia nueva no rompe al código anterior, que genera su propio formato, así que basta con revertir el Worker. La renumeración no se deshace.

## Open Questions

Ninguna. Las dos decisiones abiertas (tarjetas de prueba y correlativo `XD-000001` global) las tomó el usuario antes de la propuesta.
