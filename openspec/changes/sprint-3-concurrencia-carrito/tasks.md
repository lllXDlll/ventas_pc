# Tasks

## 1. Almacén de disponibilidad

- [x] 1.1 Métodos `consultarVarios`, `reconstruirVarios`, `liberar`, `reconciliar` (cuenta las reservas dentro del objeto) y `ajustar` en `Inventario` (design D1). Se verifica con pruebas en el pool de workerd:
  - lote con productos sin inicializar;
  - `reconstruirVarios` no sobrescribe;
  - `liberar` devuelve el stock y responde `false` si ya no existe;
  - `reconciliar` corrige un valor desviado y respeta una reserva vigente;
  - `ajustar` en un producto sin inicializar no hace nada.
- [x] 1.2 `DisponibleDurableObject.disponibles()` sobre `consultarVarios`, con reconstrucción perezosa en lote desde Postgres (stock físico − reservas `ACTIVA` vigentes, design D2). Se verifica con una prueba de integración: con el objeto vacío, `GET /productos` informa el disponible correcto.
- [x] 1.3 Catálogo: excluir `productosSinDisponible()` en el listado y las facetas, y llamar a `ajustar` al cambiar el stock desde el panel (design D2 y D7). Se verifica con pruebas de integración:
  - un producto con stock 7 y una reserva de 2 muestra 5;
  - con todo reservado, desaparece del listado y su detalle dice agotado;
  - una reposición de 5 a 8 sube el disponible en 3.

## 2. Carrito

- [x] 2.1 Módulo `carrito/` con sesión:
  - `GET /carrito`, `POST /carrito` (producto o configuración revalidada; 409 si es incompatible), `PATCH` y `DELETE /carrito/items/:id`, y `DELETE /carrito`;
  - total con los precios vigentes, `sinDisponible` y `cantidadProductos` (design D6).

  Se verifica con pruebas de integración de cada escenario de la spec `carrito`.

## 3. Reservas, expiración, confirmación y reconciliación

- [x] 3.1 `RESERVA_TTL_MIN` (D8) y `ReservasService.reservar`:
  - expansión del carrito y marca de las vencidas en Postgres;
  - liberar la anterior;
  - `reservar` con `NO_INICIALIZADO`, reconstrucción y reintento;
  - 409 con el producto faltante;
  - registro en Postgres con compensación (design D3).

  Expuesto como `POST /reservas`, `GET /reservas/activa` y `DELETE /reservas/:id`. Se verifica con pruebas de integración: éxito, 409 sin descontar nada, reemplazo de la activa, cancelar, 404 ajena y carrito vacío.
- [x] 3.2 Tarea `expirar` del cron, con ids del objeto, marca en Postgres y registro (design D4). Se verifica con pruebas de integración con `RESERVA_TTL_MIN=0.05`: tras el disparo del cron, el disponible se devuelve y la reserva queda `EXPIRADA`; además, la expiración también ocurre antes de reservar.
- [x] 3.3 `ConfirmacionService.confirmar` (design D5):
  - transacción con `FOR UPDATE`;
  - margen de 30 s;
  - `UPDATE` condicional con versión y reintentos;
  - orden, ítems y comprobante, y la reserva `CONFIRMADA`;
  - `cerrar` sin devolver stock;
  - idempotencia por clave y `P2002`.

  Se verifica con pruebas de integración:
  - stock 5, versión 3 y 2 unidades → stock 3, versión 4, con orden y comprobante;
  - expirada → 409 sin orden;
  - misma clave dos veces → una orden;
  - dos confirmaciones simultáneas con la misma clave → una orden;
  - otra clave de la misma reserva → error.
- [x] 3.4 Tarea `reconciliar` del cron con `ReconciliacionService` (stock físico de los productos activos y `Inventario.reconciliar`) y su registro. Se verifica con pruebas de integración:
  - vaciar el objeto y comprobar que el disponible vuelve a ser correcto sin intervención;
  - desviar un valor y comprobar que se corrige;
  - una reserva durante la reconciliación queda descontada.
- [x] 3.5 Concurrencia: 60 clientes con sesión reservan a la vez 1 unidad de un producto de 5. Se verifica con una prueba de integración: exactamente 5 respuestas 201, el resto 409, y el disponible final es 0.

## 4. Frontend

- [ ] 4.1 `lib/carrito.ts` con `useAgregarAlCarrito` (401 → `/ingresar?volver=`), y los botones "Añadir al carrito" del catálogo (contenedor que pasa la `accion` a `ProductCard`) y del detalle (design D9). Se verifica con una prueba de Playwright: con sesión, agregar desde el detalle aumenta el contador; sin sesión, pide iniciar sesión.
- [ ] 4.2 Pantalla `/carrito` (`features/carrito`):
  - ítems con cantidades y quitar;
  - total;
  - estados de carga, vacío y error;
  - contador de la cabecera por slot.

  Se verifica con una prueba de Playwright que cambia una cantidad, quita un ítem y comprueba el total.
- [ ] 4.3 Reserva en pantalla: "Iniciar compra", cuenta regresiva, "Pagar" como "Disponible pronto", "Cancelar reserva", aviso de producto sin stock y de reserva expirada con "Reservar de nuevo". Se verifica con una prueba de Playwright: reservar, ver el tiempo restante, cancelar, y reservar sin stock.
- [ ] 4.4 Armador: "Agregar al carrito" guarda la configuración y la agrega cuando es agregable. Se verifica con una prueba de Playwright: el armado compatible aparece en `/carrito`.
- [ ] 4.5 Agregar `/carrito` a las pruebas de axe y de 360 px. Se verifica con `pnpm test:e2e` en verde, en local y en la CI.

## 5. Prueba de carga y cierre

- [ ] 5.1 `tests/k6/preparar.mjs`, `tests/k6/reserva_concurrente.js` y `tests/k6/verificar.mjs` (design D11), con `datos.json` en `.gitignore`. Se verifica con una corrida local contra `wrangler dev`: 300 VUs, exactamente 5 respuestas 201, y `verificar` confirma Σ reservado ≤ stock y stock físico ≥ 0.
- [ ] 5.2 Una corrida de k6 contra `*.workers.dev` en producción, con preparación y limpieza en Neon, y medición con `wrangler tail` de la CPU de `POST /reservas`. Se registran la latencia (p50 y p95), las exitosas y la CPU en `docs/compatibilidad-cloudflare.md`. Se verifica con la sección agregada y los datos de prueba borrados.
- [ ] 5.3 Documentación:
  - en `docs/00_parte_tecnica.md`: la sección 5.2 con los métodos nuevos del objeto, la reconciliación dentro del objeto y el margen de 30 s, y `RESERVA_TTL_MIN` en la sección 7;
  - en `docs/sprint_03_concurrencia_carrito.md`: una nota con las decisiones.

  Se verifica con una lectura sin contradicciones con design.md.
- [ ] 5.4 CI completa en verde y `@humo` contra producción. Se verifica con la ejecución de la CI del último commit y con `E2E_URL=https://xdtech.store pnpm test:e2e --grep @humo`.

## Workflow follow-up

- Archivar el cambio con `/opsx:archive` cuando la definición de hecho esté verificada.
- Proponer el Sprint 4 (pago, notificaciones e historial), que expone `ConfirmacionService.confirmar` con `Idempotency-Key`.
