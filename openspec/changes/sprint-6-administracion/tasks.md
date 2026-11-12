# Tasks

## 1. Gestión de reglas (HU-15)

- [x] 1.1 `ESQUEMA_PARAMETROS` y `validarParametros(codigo, valor)` en `motor/parametros.ts` (D1), más el ayudante `parametrosInvalidos` en `comun/errores.ts`. Pruebas unitarias:
  - margen de 150 rechazado;
  - `"20"` (cadena) rechazado;
  - clave desconocida en `SOCKET` rechazada;
  - a `POTENCIA` le falta un parámetro;
  - valores válidos normalizados.
- [x] 1.2 Módulo `admin/` con `ReglasService` y `ReglasController`: `GET /admin/reglas` y `PATCH /admin/reglas/:codigo` con `@Roles('ADMIN')`, DTO de forma, 404 para un código inexistente y 400 `PARAMETROS_INVALIDOS`. Las pruebas de integración cubren los escenarios de la spec `gestion-reglas`: listar, desactivar `SOCKET`, cambiar el margen, parámetro inválido sin cambios y CLIENTE 403.
- [x] 1.3 Prueba de integración «cambios aplicados a las siguientes validaciones»: con el margen de `POTENCIA` en 60 %, `POST /compatibilidad/validar` devuelve el rechazo `POTENCIA`; con `SOCKET` desactivada, AM5 con LGA1700 no lo rechaza. La prueba restablece las reglas al terminar.

## 2. Reportes (HU-33 y HU-34)

- [x] 2.1 `admin/rango.ts` con `rangoDeFechas` (D2). Pruebas unitarias:
  - sin parámetros, el 2026-11-30 da del 01 al 30;
  - borde del día en Lima (23:30 −05:00);
  - rango invertido;
  - 367 días;
  - `2026-02-30` inválido.
- [x] 2.2 Migración con los índices `ordenes(creada_en)` y `uso_asistente(creado_en)`. Se verifica con `prisma migrate dev` en local y con `esquema.int.test.ts` en verde.
- [x] 2.3 `ReportesService.ventas` y `GET /admin/reportes/ventas` (D3). Las pruebas de integración siembran órdenes y comprueban:
  - totales y ticket promedio de la spec (`"1500.00"`, 2 y `"750.00"`);
  - top de productos con desempate por importe;
  - serie de 7 puntos con días en cero;
  - rango vacío;
  - orden al borde del día;
  - 400 con un rango inválido.
- [x] 2.4 `ReportesService.asistente` y `GET /admin/reportes/asistente` con `PRECIOS_MODELO` (D3). Las pruebas de integración siembran `uso_asistente` y comprueban:
  - 4 consultas, 25 % de respaldo y latencia de 10 000 ms;
  - los cinco usos presentes;
  - motivo `IA_TIMEOUT`;
  - costo US$0,0355 con 3038/1167 tokens;
  - rango sin consultas, todo en cero.
- [x] 2.5 `test/rutas-admin.e2e.test.ts` incluye las rutas nuevas: sin sesión 401, con CLIENTE 403, con ADMIN 200.

## 3. Reconciliación tras perder el almacén

- [x] 3.1 `Inventario.reconciliar(fisicos, ahora?, reservasPostgres?)` con la unión por id de reserva (D5), y `Inventario.vaciar()`, que borra todo y recrea el esquema. Las pruebas de workers comprueban:
  - almacén vacío con 2 reservas de Postgres da disponible 3;
  - una reserva presente en los dos lados se cuenta una vez;
  - una reserva en vuelo solo en el objeto se descuenta;
  - sin el segundo parámetro se mantiene el comportamiento anterior;
  - después de `vaciar()` el objeto vuelve a reservar.
- [x] 3.2 `ReconciliacionService` lee en una sola consulta el físico y los ítems de las reservas `ACTIVA` vigentes y los pasa al objeto. La prueba de integración vacía el almacén con reservas activas, reconcilia y comprueba el disponible en `GET /productos/:id`.

## 4. Endpoint de pruebas

- [x] 4.1 `pruebas/pruebas.module.ts` con `POST /pruebas/inventario/vaciar` (ADMIN), registrado solo con `PRUEBAS_HABILITADAS === 'true'` (D6).
  - La variable va en `.dev.vars.example`, en los vars de la integración y en los de Playwright.
  - Pruebas: unitaria que falla si `wrangler.jsonc` define la variable; de integración con la variable (vacía y devuelve los conteos) y sin ella (404).

## 5. Pantallas del panel

- [ ] 5.1 Agregar `recharts@3.10.1` a `apps/web` y los enlaces "Reglas", "Reporte de ventas" y "Reporte del asistente" en `AdminShell`. Se verifica con `pnpm build` del web en verde y anotando el tamaño del chunk de Recharts, que no debe aparecer en las rutas de la tienda.
- [ ] 5.2 `/admin/reglas`: tarjetas por regla generadas desde la descripción de parámetros, con interruptor, campos con unidad y límites, guardado por tarjeta y error de la API junto al campo. E2e:
  - desactivar `SOCKET`;
  - margen 25 que persiste al recargar;
  - 150 muestra el error y no guarda;
  - axe sin violaciones graves y 360 px.
  - La prueba restablece las reglas.
- [ ] 5.3 `/admin/reportes/ventas`: filtro en la URL, tarjetas, gráfico de barras por día cargado con `next/dynamic` y tabla del top 10, con estados de carga, vacío y error. E2e:
  - el filtro cambia la URL y los datos;
  - rango sin ventas muestra el mensaje;
  - la tabla tiene encabezados;
  - axe y 360 px.
- [ ] 5.4 `/admin/reportes/asistente`: filtro, tarjetas (consultas, % de respaldo, latencia y costo estimado), gráfico por uso y tabla de motivos. E2e:
  - con consultas del proveedor simulado sembradas por la prueba, se ven los indicadores y los cinco usos;
  - axe y 360 px.

## 6. Pruebas de carga (HU-37b)

- [ ] 6.1 `preparar.mjs --escenario <concurrencia|idempotencia|expiracion|perdida>` y `verificar.mjs` con los invariantes de la spec `pruebas-carga` y la limpieza de órdenes, comprobantes, notificaciones, reservas, sesiones, usuarios y producto. Se prueba en local preparando y limpiando cada escenario sin dejar filas.
- [ ] 6.2 `idempotencia.js`, `expiracion.js` y `perdida_almacen.js` (D7), y `handleSummary` en los cuatro scripts hacia `tests/k6/resultados/`. Se verifica con una corrida local de los cuatro en verde: 5/5, una orden por cliente, segunda oleada 5 y tras la pérdida 3.
- [ ] 6.3 Corridas finales:
  - expiración y pérdida en local;
  - concurrencia e idempotencia contra producción (`workers.dev`), con `verificar.mjs` limpio;
  - JSON en `tests/k6/resultados/`;
  - resultados y CPU de `wrangler tail` en `docs/compatibilidad-cloudflare.md`.

## 7. Endurecimiento de seguridad

- [ ] 7.1 Revisión de código con evidencia en `docs/compatibilidad-cloudflare.md`:
  - hash PBKDF2 de 50.000 iteraciones y por qué no se sube;
  - sesiones con vencimiento;
  - `@Roles('ADMIN')` en cada ruta `/admin` (prueba 2.5);
  - todo `@Body` y `@Query` con DTO validado, corrigiendo los que falten, con una prueba de integración por cada corrección;
  - límites en `Limites` y asistente contado desde `uso_asistente`.
- [ ] 7.2 `.gitleaks.toml` y el paso de gitleaks, en versión fija y con `fetch-depth: 0`, en el job `verificar` de la CI (D9). Se corre en local sobre el historial completo, sin hallazgos fuera de las excepciones. Si aparece un secreto real, se avisa al usuario antes de seguir.
- [ ] 7.3 `scripts/seguridad-produccion.mjs` (D8):
  - flags de la cookie;
  - CORS con origen ajeno y propio;
  - 404 del endpoint de pruebas;
  - conteo de sesiones vencidas, con `DIRECT_URL` por `Read-Host`;
  - IP de `/cdn-cgi/trace` contra la de `wrangler tail`;
  - límite de inicio de sesión que resiste un `X-Forwarded-For` falso (al final, con aviso previo).
  - Los resultados se anotan en `docs/compatibilidad-cloudflare.md`.

## 8. Cierre

- [ ] 8.1 Escenario `@humo` contra producción: `/pruebas/inventario/vaciar` responde 404, y `/admin/reglas` y los reportes sin sesión llevan a `/ingresar`.
- [ ] 8.2 Documentación en `docs/00_parte_tecnica.md`: gestión de reglas, reportes (rango en hora de Lima y costo estimado) y endpoint de pruebas; filas nuevas en la tabla de valores por defecto (`PRUEBAS_HABILITADAS`).
- [ ] 8.3 CI en verde (verificar con gitleaks, e2e y desplegar) y `@humo` contra producción en verde tras el despliegue.
