## 1. Datos y comprobante correlativo

- [x] 1.1 Migración `comprobantes_correlativo`: `CREATE SEQUENCE comprobante_numero_seq`, renumeración en dos pasos de los comprobantes existentes por `(fecha, id)` y `setval` al máximo (design D3); aplicarla en local
- [x] 1.2 Prueba de la migración: 3 comprobantes con formato viejo quedan `XD-000001…3` y `nextval` da 4; en base vacía la primera compra es `XD-000001`
- [x] 1.3 `ConfirmacionService`: número con `nextval` después de crear la orden, `detalle` con nombre, subtotal y `tarjeta.ultimos4`, `comprobanteId` en `OrdenConfirmada`; parámetro opcional `{ ultimos4 }` en `confirmar` (y en el RPC del Worker)

## 2. Notificaciones (API)

- [x] 2.1 Módulo `notificaciones/`: `NotificacionesService` (`crear` con cliente de transacción, `crearSiNoHay`, `listar` 20 + no leídas, `marcarLeida` con 404 ajeno o id inválido) y tipos `PRODUCTO_AGOTADO` y `COMPRA_CONFIRMADA`
- [x] 2.2 `NotificacionesController`: `GET /notificaciones` y `PATCH /notificaciones/:id/leida` con sesión; registrar el módulo en `AppModule`
- [x] 2.3 `ReservasService.reservar`: aviso de producto agotado sin duplicar en la rama `INSUFICIENTE`, sin cambiar la respuesta 409 si el aviso falla
- [x] 2.4 `ConfirmacionService`: `tx.notificacion.create` de compra confirmada con el número de comprobante dentro de la transacción; `PedidosModule` importa `NotificacionesModule`
- [x] 2.5 Pruebas de integración: aviso de agotado y su no duplicado, aviso de compra (uno solo tras reintento), listar y marcar con aislamiento por usuario, 401 sin sesión

## 3. Pago simulado (API)

- [x] 3.1 `pagos/pago-simulado.service.ts`: validación (Luhn, vencimiento, CVV, titular), forzado por `PAGO_SIMULADO_FORZAR` y regla por número (design D1); variable vacía en `wrangler.jsonc` y en el tipo `Env`
- [x] 3.2 Pruebas unitarias del pago simulado: aprobada, rechazada, Luhn inválido, vencimiento pasado, CVV y forzado
- [x] 3.3 `PagosService.pagar` y `PagosController` `POST /pagos/confirmar`: clave, orden existente sin reautorizar, reserva vigente (409), autorización (402 `PAGO_RECHAZADO`), confirmación con `ultimos4` (design D2); sin datos de tarjeta en logs
- [x] 3.4 `ComprobantesController` `GET /comprobantes/:id` solo para el dueño (404 ajeno), con correo del cliente y nombre de respaldo para comprobantes antiguos
- [x] 3.5 Pruebas de integración: aprobado (stock, orden, comprobante `XD-\d{6}`), rechazo con la reserva activa y reintento aprobado, reserva expirada o ajena, sin clave (400), mismo pago repetido y simultáneo con la misma clave, 10 confirmaciones concurrentes con números distintos y consecutivos, comprobante propio y ajeno, ninguna tabla con el número completo

## 4. Historial (API)

- [x] 4.1 `HistorialService` y `HistorialController`: `GET /historial/compras?pagina=` (20 por página, estado `PAGADA`, comprobante y cantidad de productos) y `GET /historial/compras/:id` con 404 ajeno
- [x] 4.2 `GET /historial/configuraciones?pagina=` con origen, presupuesto, uso, estado guardado y componentes; `ConfiguracionesService.revalidar` y `POST /historial/configuraciones/:id/revalidar` que guarda el estado
- [x] 4.3 Pruebas de integración: orden y paginación del historial, solo lo propio, detalle y 404 ajeno, revalidar con un producto agotado y con una regla nueva

## 5. Frontend

- [x] 5.1 `eslint.config.mjs`: agregar `carrito`, `notificaciones` e `historial` a `FUNCIONALIDADES` y corregir lo que la regla de capas marque; `lib/notificaciones.ts` con la clave de consulta
- [x] 5.2 Pantalla `/pago` en `features/carrito`: cuenta regresiva, resumen, formulario no controlado con tarjetas de prueba, clave de idempotencia por intento, botón deshabilitado mientras paga, rechazo con reintento, redirección al comprobante e invalidación de carrito, reserva y notificaciones; "Pagar" en la reserva pasa a ser un enlace a `/pago`
- [x] 5.3 `features/notificaciones`: campana con contador y popover accesible (Esc, foco), marcar como leída, consulta cada 60 s solo con la pestaña visible; ranura `notificaciones` en `Header`, oculta sin sesión
- [x] 5.4 `features/historial`: `/cuenta/compras` (tabla y estado vacío), `/cuenta/compras/[id]`, `/cuenta/comprobantes/[id]` imprimible (`print:hidden` en cabecera, pie y botones) y `/cuenta/configuraciones` con "Revalidar" y "Abrir en el armador"; redirección a `/ingresar` sin sesión
- [x] 5.5 Enlaces "Mis compras" y "Mis configuraciones" en `MenuCuenta` (también en el menú lateral móvil)
- [x] 5.6 Pruebas unitarias de los componentes nuevos de presentación que tengan lógica (formato de tarjeta, contador de la campana)

## 6. E2e, documentación y despliegue

- [x] 6.1 E2e del flujo completo: registrarse, armar y agregar al carrito, reservar, pagar con `4242…`, ver comprobante, campana con 1 aviso, compra en "Mis compras", revalidar y abrir la configuración; más rechazo con reintento, aviso de agotado e impresión emulada
- [x] 6.2 Actualizar los e2e del Sprint 3 que esperaban "Pagar" como "Disponible pronto"; axe en `/pago`, `/cuenta/*` y la campana abierta, y 360 px sin desbordes
- [x] 6.3 `@humo` contra producción solo con las pantallas nuevas, sin pagar
- [x] 6.4 Documentación: `docs/00_parte_tecnica.md` (pago simulado, tarjetas de prueba, correlativo y su riesgo de hueco, deuda de reembolso) y `docs/compatibilidad-cloudflare.md` si cambian las mediciones
- [x] 6.5 CI en verde, despliegue con la migración aplicada en Neon y `@humo` contra producción en verde
