# Design

## Context

Motivación y alcance: ver proposal.md. Los requisitos están en `specs/`. Las fuentes son `docs/sprint_03_concurrencia_carrito.md` y las reglas no negociables de la sección 5 de `docs/00_parte_tecnica.md`. Hay tres decisiones del desarrollador:
- la reserva es de todo el carrito, con una activa por cliente;
- tras reservar se muestran la cuenta regresiva y el botón "Cancelar reserva";
- la compatibilidad se revalida solo al agregar.

**Estado de partida (cierre del Sprint 2)**
- **Durable Object `Inventario`** (`reservas/inventario.ts`, prototipo del Sprint 0 probado en workerd):
  - tablas SQLite `disponible`, `reservas(id, vence_en)` y `reserva_items`;
  - métodos `reservar` (expira primero; todo o nada; `NO_INICIALIZADO`, `INSUFICIENTE` o `INVALIDA`), `expirar`, `cerrar` (sin devolver stock), `reconstruir` (no sobrescribe) y `consultar`.
- **`DisponibleService`:** es el puerto abstracto. `DisponibleDurableObject.disponibles()` devuelve hoy el stock físico. El catálogo filtra `stock.cantidad > 0` en SQL.
- **Tablas:** `carritos` (único por usuario), `carrito_items` (`producto_id` o `configuracion_id`, y cantidad), `reservas` (`estado ACTIVA|CONFIRMADA|EXPIRADA`, `vence_en`), `reserva_items`, `ordenes` (`clave_idempotencia` única y `reserva_id` única), `orden_items` y `comprobantes` (número único). Todas existen y están vacías, así que no hay migración.
- **Crons:** `despacho.ts` llama a `expirar` y `reconciliar`, hoy vacías, cada minuto y cada 5 minutos.
- **Motor:** `CompatibilidadService.evaluar()` del Sprint 2.
- **Medido en el Sprint 0:** 300 reservas concurrentes sobre 5 unidades dan 5; la espera en el objeto es p50 132 ms y p95 383 ms; hay 1 subrequest por llamada; cada reserva de N productos escribe 2 + 2·N filas.
- **Latencia:** ~150 ms por consulta a Neon (`us-east-2`).
- **`k6`:** está instalado en la máquina de desarrollo.

## Goals / Non-Goals

**Goals:**
- Ninguna sobreventa, ni en el almacén ni en Postgres. El stock físico nunca queda negativo.
- Pocas llamadas por operación:
  - leer el catálogo: 1 llamada al objeto;
  - reservar: como mucho 4 subrequests al objeto (liberar la anterior, reservar, y reconstruir y reintentar).
- Recuperación sin intervención: si el objeto se vacía, el disponible se reconstruye solo.

**Non-Goals:**
- El endpoint y la pantalla de pago (Sprint 4); `confirmar` solo se expone como servicio.
- Notificaciones e historial.
- Reservar varios carritos.
- Precios bloqueados en la reserva: la orden usa el precio vigente al confirmar.

## Decisions

### D1. Métodos nuevos del Durable Object
Todos son síncronos dentro del objeto, sin `await` entre leer y escribir, así que son atómicos respecto a `reservar`.

- **`consultarVarios(ids)`:** devuelve `Record<id, number | null>`. Lo usa el catálogo y cuesta 1 subrequest por página.
- **`reconstruirVarios(items[{ productoId, cantidad }])`:** inserta con `ON CONFLICT DO NOTHING` (nunca sobrescribe) y devuelve el valor vigente de cada uno. Es la reconstrucción perezosa en lote.
- **`liberar(reservaId)`:** es lo inverso de `reservar`. Suma las cantidades de sus ítems al disponible y borra la reserva. Devuelve `false` si no existía, por ejemplo si ya expiró. Lo usan "Cancelar", "reservar de nuevo" y la compensación cuando falla el registro en Postgres.
- **`reconciliar(fisicos[{ productoId, fisico }])`:**
  1. expira primero lo vencido;
  2. para cada producto calcula `objetivo = max(0, fisico − Σ cantidad de sus reserva_items vigentes en el objeto)`;
  3. escribe `objetivo` si difiere o si no existía;
  4. devuelve los productos corregidos.

  Las reservas activas se cuentan **dentro del objeto**, no desde Postgres. Una reserva ya hecha en el objeto pero todavía no registrada en Postgres (en vuelo) no se pierde. Leer `ACTIVA` de Postgres y escribir el resultado podría pisarla y causar sobreventa. Así se cumple el escenario "Reserva concurrente" de la spec `disponibilidad`.
- **`ajustar(productoId, delta)`:** si existe, `cantidad = max(0, cantidad + delta)`; si no, no hace nada, porque se reconstruirá perezosamente. Lo usa el cambio de stock del ADMIN.

*Alternativa:* reconciliar en la API con `UPDATE` del valor calculado en Postgres. Se descarta por la carrera con las reservas en vuelo.

### D2. `DisponibleService` sobre el objeto y el catálogo
`DisponibleDurableObject.disponibles(productos)`:
1. llama a `consultarVarios`;
2. si hay productos sin inicializar (`null`), calcula en Postgres `fisico − Σ reservas ACTIVA no vencidas` en una sola consulta agrupada y llama a `reconstruirVarios`.

Son 2 subrequests y 1 consulta, solo cuando falta algo.

**Filtro del listado y las facetas:** "disponible > 0" no se puede expresar en un `where` de Prisma. Se agrega una consulta a `productosSinDisponible()`, que hace `SELECT producto_id` de los productos con `Σ reservas ACTIVA vigentes >= stock`. Normalmente no devuelve ninguna fila. El listado excluye esos productos con `id: { notIn }`, además de `stock > 0`. El número que se muestra sale del objeto.

En operación normal los dos valores coinciden. Si difieren durante unos segundos (una reserva en vuelo o una reconciliación pendiente), un producto que llegó a 0 en el objeto se quita igual de la página. En ese caso el total puede contar uno de más hasta la siguiente consulta.

### D3. Reservar (`ReservasService.reservar(usuarioId)`)
1. **Leer el carrito** con sus configuraciones expandidas a productos. Se suman las cantidades por producto, que tienen que estar activos. Si el carrito está vacío, responde 400.
2. **Marcar vencidas en Postgres:** `UPDATE reservas SET estado = 'EXPIRADA' WHERE estado = 'ACTIVA' AND vence_en < now()`. Es barata y mantiene Postgres al día entre crons.
3. **Liberar la reserva activa anterior** del usuario, si la hay: `liberar` en el objeto y `EXPIRADA` en Postgres. Así hay una activa por cliente.
4. **Reservar en el objeto:** `id = uuid v7` y `venceEn = now + RESERVA_TTL_MIN`, con `Inventario.reservar(items, venceEn, id)`. El objeto expira las vencidas dentro de la misma operación.
   - `NO_INICIALIZADO`: se llama a `reconstruirVarios` desde Postgres y se reintenta una vez.
   - `INSUFICIENTE`: responde 409 `SIN_STOCK` con `{ productoId, nombre, disponible }`.
5. **Registrar en Postgres:** `reservas` (`ACTIVA`, mismo id y vencimiento) y `reserva_items` en una escritura anidada. Si falla, se llama a `liberar(id)` en el objeto y se propaga el error, así que no queda stock tomado sin registro.

`DELETE /reservas/:id`: el dueño con estado `ACTIVA` llama a `liberar` y la marca `EXPIRADA`. Si no es suya o no está activa, responde 404.

### D4. Expiración
- **Cron de cada minuto (`expirar`):**
  1. `Inventario.expirar()` devuelve los ids expirados;
  2. `UPDATE reservas SET estado = 'EXPIRADA' WHERE id = ANY($ids) AND estado = 'ACTIVA'`;
  3. se aplica además la red de seguridad por `vence_en < now()`;
  4. se registra la cantidad.
- **En cada reserva:** dentro de `Inventario.reservar` y en el paso 2 de D3.
- **Carrera entre confirmar y expirar:** la confirmación (D5) exige `vence_en > now() + 30 s`. Una reserva que vence en menos de 30 segundos ya no se confirma: se informa como expirada y el cliente vuelve a reservar. Así el objeto nunca devuelve al disponible algo que Postgres está por vender. Aunque ocurriera, el `UPDATE` condicional (`cantidad >= n`) impide que el stock físico quede negativo, y la reconciliación corrige el disponible.

### D5. Confirmación (`ConfirmacionService.confirmar(usuarioId, reservaId, clave)`)
Es un servicio sin endpoint (lo expone el Sprint 4). La clave es obligatoria (texto de 8 a 100 caracteres).

1. **Reintento:** si ya existe una orden con esa clave, la devuelve si es de la misma reserva y del mismo usuario. Si es de otra, responde 409 `CLAVE_EN_USO`.
2. **Transacción interactiva** (`$transaction` sobre la conexión de la petición):
   - `SELECT … FROM reservas WHERE id = $1 AND usuario_id = $2 FOR UPDATE`. Debe estar `ACTIVA` y con `vence_en > now() + 30 s`; si no, lanza `RESERVA_EXPIRADA` (409) sin escribir.
   - Por cada ítem, en orden por `producto_id` para evitar interbloqueos:
     - leer `cantidad` y `version`;
     - `UPDATE stock SET cantidad = cantidad - n, version = version + 1 WHERE producto_id = X AND cantidad >= n AND version = v`;
     - si actualiza 0 filas, releer y reintentar hasta 3 veces si la versión cambió; si la cantidad no alcanza, lanzar `SIN_STOCK` y revertir.
   - Crear la orden (total con los precios vigentes), sus ítems con `precio_unitario` y el comprobante: número `XD-AAAAMMDD-<6 caracteres del id>` y `detalle` JSON con los ítems y el total.
   - Marcar la reserva `CONFIRMADA`.
3. **Confirmación simultánea:** si una confirmación concurrente con la misma clave gana, `P2002` sobre `clave_idempotencia` hace que se lea y devuelva su orden.
4. **Después del commit:** `Inventario.cerrar(id)`, que no devuelve stock. Si falla, se registra en el log; la reconciliación no pierde nada, porque el objeto ya había descontado.

### D6. Carrito
- **Módulo `carrito/`**, con `@RequiereSesion()` en todo.
- **`POST /carrito`** recibe `{ productoId, cantidad }` o `{ configuracionId, cantidad }`, con cantidad de 1 a 8.
  - Un producto repetido suma su cantidad, hasta 8.
  - Una configuración propia se evalúa con `CompatibilidadService.evaluar` (estricto). Si no es compatible, responde 409 `CONFIGURACION_INCOMPATIBLE` con los rechazos.
  - El carrito se crea al agregar el primer ítem.
- **`GET /carrito`** devuelve `{ items: [{ id, tipo: 'PRODUCTO'|'CONFIGURACION', cantidad, producto?, configuracion?: { id, productos }, subtotal, sinDisponible }], total, cantidadProductos }`:
  - `sinDisponible` sale de `DisponibleService`;
  - `cantidadProductos` es para el contador de la cabecera.
  - Son 2 consultas y 1 llamada al objeto.
- **Edición:** `PATCH /carrito/items/:id` cambia la cantidad, `DELETE /carrito/items/:id` quita el ítem y `DELETE /carrito` lo vacía.
- **Expansión para reservar:** la hace `CarritoService.productos(usuarioId)`, que suma cantidad × cantidad del ítem de configuración.

### D7. Cambios de stock del ADMIN
`CatalogoService.actualizarStock`, tras el `UPDATE` con versión (Sprint 1), llama a `Inventario.ajustar(productoId, nueva − anterior)`. La cantidad anterior se lee en la misma consulta. El alta de un producto no toca el objeto: se reconstruye perezosamente.

### D8. Configuración
`RESERVA_TTL_MIN` en `wrangler.jsonc` vale `10`. Admite decimales, para que las pruebas usen vencimientos de segundos (por ejemplo `0.05`). Se valida al leerla: debe ser mayor que 0 y como mucho 60.

### D9. Frontend
**`features/carrito`:**
- **`api.ts`** y los hooks `useCarrito`, `useReservaActiva` y sus mutaciones.
- **Componentes:**
  - `ListaCarrito`: ítems con cantidades y quitar;
  - `ResumenCarrito`: total e "Iniciar compra";
  - `ReservaActiva`: cuenta regresiva, "Pagar" como "Disponible pronto", "Cancelar reserva" y el aviso de expirada.
- **Ruta `/carrito`:** sin sesión, pide iniciar sesión con `volver=/carrito`.
- **Agregar desde otras funcionalidades:** el catálogo y el armador no pueden importar `features/carrito`, por la regla de capas. Por eso la mutación compartida para agregar va en `lib/carrito.ts`, con `useAgregarAlCarrito()`:
  - llama a `POST /carrito`;
  - invalida `['carrito']`;
  - con 401, va a `/ingresar?volver=…`.

  Las tarjetas y el detalle la usan a través de un contenedor del catálogo, que pasa la `accion` a `ProductCard`. El armador la usa tras guardar la configuración.
- **Contador de la cabecera:** `BotonCarrito` recibe la cantidad por props. El slot `carrito` del `Header` lo llena un contenedor de `features/carrito` en `app/layout.tsx`, y solo consulta si hay sesión.

### D10. Pruebas
- **Workers (pool de workerd):** `consultarVarios`, `reconstruirVarios`, `liberar`, `reconciliar` (con reservas vigentes y vencidas) y `ajustar`.
- **Integración (harness y Postgres):**
  - carrito: agregar, sumar, configuración incompatible 409, ajena 404, cantidades, total y 401;
  - reservas:
    - éxito, 409 sin stock con nada descontado, reemplazo de la activa, cancelar y 404 ajena;
    - expiración con `RESERVA_TTL_MIN=0.05` por cron y antes de reservar;
    - **60 clientes simultáneos sobre 5 unidades**, con exactamente 5 reservas exitosas;
  - confirmación: descuento con versión, expirada, idempotente, y dos confirmaciones simultáneas con la misma clave que dan una orden;
  - reconciliación: vaciar el objeto con `getDurableObjectStorage` y comprobar que el disponible vuelve a ser correcto; desviar el valor y corregirlo; y el escenario de reserva concurrente.
- **e2e:** agregar desde el detalle y desde el armador, el contador, iniciar compra con cuenta regresiva, cancelar, sin stock, y axe y 360 px en `/carrito`.

### D11. k6 (HU-37a)
**`tests/k6/preparar.mjs`** usa Node y `pg` sobre `DIRECT_URL`:
- crea un producto de 5 unidades;
- crea 300 usuarios con su **sesión insertada directamente** en `sesiones`, con un token conocido y su hash, y un carrito con 1 unidad.

Así se evita el límite de 5 registros por hora por IP. Escribe `tests/k6/datos.json` (en `.gitignore`).

**`tests/k6/reserva_concurrente.js`:**
- 300 VUs, cada uno con su cookie y 1 iteración, hacen `POST /reservas`;
- verifican exactamente 5 respuestas 201 y el resto 409.

**`tests/k6/verificar.mjs`** comprueba en Postgres:
- 5 reservas activas;
- Σ reservado ≤ stock;
- stock físico ≥ 0;
- y limpia los datos.

**Corridas:**
- en local, con `wrangler dev` y límites altos;
- una sola vez contra `xdtech-api.<cuenta>.workers.dev` con `DIRECT_URL` de Neon, para preparar y limpiar.

"Ninguna orden por encima del stock" se verifica en la prueba de integración de confirmación concurrente, porque no hay endpoint de pago hasta el Sprint 4.

## Risks / Trade-offs

- **[Un solo objeto como cuello de botella]** → Medido en el Sprint 0: p95 de 383 ms con 300 concurrentes. Se repite con k6.
- **[Filas escritas por día (100.000)]** → 4 filas por reserva de un producto. La corrida de k6 en producción escribe ~1.200 y la expiración libera filas. Hay una sola corrida contra producción.
- **[Carrera entre confirmar y expirar]** → Margen de 30 s (D4), `UPDATE` condicional y reconciliación.
- **[Compensación fallida (`liberar` tras error de Postgres)]** → La reserva del objeto vence sola por TTL y se libera. Se registra en el log.
- **[CPU de reservar]** → Unas 4 consultas y hasta 4 subrequests. Se mide con `wrangler tail`; el objetivo es estar en el orden de las rutas medidas (12 a 21 ms).
- **[Datos de k6 en producción]** → Los borra `verificar.mjs`, y las cuentas usan el dominio `@xdtech.test`.

## Migration Plan

1. Desplegar la API: métodos nuevos del objeto (compatibles con los datos del prototipo), servicios, endpoints y crons con lógica, y `RESERVA_TTL_MIN`. No hay migración de esquema.
2. El objeto de producción está vacío o tiene datos del Sprint 0. En la primera lectura el disponible se reconstruye perezosamente, y la reconciliación corrige lo que haya quedado del prototipo.
3. Desplegar la web con el carrito.

**Vuelta atrás:** revertir. Las reservas `ACTIVA` que queden vencen solas; la versión anterior no las lee.

## Open Questions

- Ninguna que cambie lo que se construye.
