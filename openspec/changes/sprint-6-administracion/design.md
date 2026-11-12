# Design

## Context

**Lo que ya existe y este sprint aprovecha:**
- **Reglas:** `reglas_compatibilidad` tiene `codigo`, `activa` y `parametros` (JSONB). `CompatibilidadService.evaluar` y el asistente las leen de Postgres en cada validación, sin caché.
  - `motor/parametros.ts` tiene los códigos y los parámetros por defecto. Hoy solo `POTENCIA` tiene parámetros: `margenPorcentaje` y `consumoBaseW`.
  - El orquestador ignora los valores que no son números. Por eso no hay validación de entrada: hasta ahora solo la semilla escribe parámetros.
- **Ventas:** las órdenes (`ordenes` y `orden_items`) solo existen confirmadas, con `total` y `precio_unitario` congelados. Hay un índice `(usuario_id, creada_en)`, pero ninguno por `creada_en` solo.
- **Asistente:** `uso_asistente` guarda `presupuesto`, `uso`, `latencia_ms` y `uso_respaldo`. En `resultado` (JSONB) van `motivo`, `tokens {entrada, salida}`, `intentos`, `explicaciones` y `configuracionId`.
- **Panel:** `/admin` está protegido por `SoloAdmin` y `AdminShell`, con una sola sección (Catálogo). En la API, `@Roles('ADMIN')` y `test/rutas-admin.e2e.test.ts` comprueban que toda ruta `/admin` exige el rol.
- **Durable Object `Inventario`:**
  - `reconciliar(fisicos)` calcula `físico − Σ reserva_items del propio objeto`;
  - la reconstrucción perezosa (`reconstruirVarios`) usa `físico − reservas ACTIVA de Postgres`;
  - la expiración de Postgres también marca por `vence_en`, sin depender del objeto.
- **k6 (Sprint 3):** `tests/k6/` tiene `preparar.mjs`, que inserta clientes con sesión en la base; `reserva_concurrente.js`, y `verificar.mjs`, que verifica y limpia.
  - La corrida va contra `xdtech-api.<cuenta>.workers.dev`, porque el borde de `api.xdtech.store` responde 429 a una ráfaga desde una IP.
- **Seguridad ya implementada** (falta revisarla con evidencia):
  - PBKDF2 de 50.000 iteraciones, el máximo razonable en Workers, que admite hasta 100.000;
  - cookie `httpOnly` y `SameSite=Lax`, con `Secure` cuando hay dominio;
  - CORS con origen único;
  - `ValidationPipe` con `whitelist` y `forbidNonWhitelisted`;
  - límites en el Durable Object `Limites` con `CF-Connecting-IP`;
  - limpieza diaria de sesiones (cron `0 4 * * *`).

**Decisiones del usuario para este sprint:** pruebas k6 en modo **mixto** y gráficos con **Recharts**.

## Goals / Non-Goals

**Goals:**
- Que las reglas se puedan gestionar con validación por regla y efecto en la siguiente validación.
- Reportes con agregación en SQL, correctos al borde del día en hora de Lima.
- Que la reconciliación se recupere de un almacén vacío sin dejar disponible de más.
- Cinco escenarios k6 reproducibles con resultados exportados.
- Una revisión de seguridad con evidencia, y un escaneo de secretos en la CI.

**Non-Goals:**
- Historial o auditoría de cambios de reglas, y reglas nuevas creadas desde el panel: solo se editan las seis existentes.
- Reportes exportables (CSV o PDF), comparaciones entre períodos y caché de reportes.
- Subir las iteraciones de PBKDF2. Con el límite de CPU del plan gratuito, se documenta la decisión de mantener 50.000.
- Correr la expiración con TTL corto o vaciar el almacén en producción.

## Decisions

### D1. Esquema de parámetros por regla como fuente única
`motor/parametros.ts` gana `ESQUEMA_PARAMETROS: Record<CodigoRegla, DescripcionParametro[]>`, con `{ nombre, etiqueta, unidad, min, max, entero }` por parámetro, y una función pura `validarParametros(codigo, valor)`. La función devuelve los parámetros normalizados o el primer error con el nombre del parámetro.
- `GET /admin/reglas` devuelve esa descripción, y la pantalla arma los campos con ella, así que no hay que duplicar los límites en el frontend.
- La validación es manual y no usa class-validator, porque el esquema depende del `:codigo` de la ruta.
- El DTO del `PATCH` solo valida la forma: `activa?: boolean` y `parametros?: object`. El resto va en el servicio.
- El error responde 400 `{ codigo: 'PARAMETROS_INVALIDOS', mensaje }`, con un ayudante en `comun/errores.ts`.
- **`PATCH` reemplaza los parámetros completos.** Como `POTENCIA` exige los dos, nunca queda una mezcla de valores viejos y nuevos.
- **Alternativa descartada:** un esquema JSON guardado en la base. Agrega una migración y otra fuente de verdad sin necesidad, porque las reglas son fijas en el código.

### D2. Rango de fechas como función pura
`admin/rango.ts` exporta `rangoDeFechas({ desde, hasta }, ahora)`. Devuelve `{ desde, hasta, inicio: Date, fin: Date, dias }`, donde `inicio` es `desde 00:00 −05:00` y `fin` es `(hasta + 1 día) 00:00 −05:00`, un intervalo semiabierto.
- **Zona horaria:** Lima no tiene horario de verano, así que el desfase fijo es correcto. «Hoy» se calcula en Lima.
- **Pruebas unitarias:** cubre el borde del día, los 366 días, el rango invertido y las fechas inválidas (`2026-02-30`).

### D3. Agregación en SQL con `$queryRaw`
Los dos reportes van en `admin/reportes.service.ts`, cada uno con unas pocas consultas en un solo `conPrisma`:
- **Ventas:**
  1. totales: `count` y `sum(total)` de `ordenes` en `[inicio, fin)`;
  2. serie: `generate_series` de los días, cruzada con `LEFT JOIN` contra `date_trunc('day', creada_en AT TIME ZONE 'America/Lima')`;
  3. top 10: `orden_items` con `JOIN` a `ordenes` y `productos`, `GROUP BY` producto y `ORDER BY unidades DESC, importe DESC LIMIT 10`.
- **Asistente:**
  1. totales: `count`, `count FILTER (WHERE uso_respaldo)`, `avg(latencia_ms)` y las sumas de `(resultado->'tokens'->>'entrada')::int` y de la salida;
  2. por uso: `GROUP BY uso`, completado en TypeScript con los cinco usos;
  3. por motivo: `GROUP BY resultado->>'motivo'`, solo de las consultas con respaldo.
- **Formato de los importes:** con `Decimal` en SQL y `toFixed(2)` al responder, nunca con `float`.
- **Costo estimado:** `PRECIOS_MODELO = { 'claude-opus-5-5': { entrada: 4, salida: 20 } }` en US$ por millón de tokens, con el modelo de `IA_MODELO`.
  - **Limitación:** `uso_asistente` no guarda el modelo, así que el costo usa el precio vigente.
- **Índices nuevos:** una migración agrega `ordenes(creada_en)` y `uso_asistente(creado_en)`. Son baratos y evitan recorrer las tablas al filtrar por fecha.
- **Alternativa descartada:** agregar en TypeScript tras traer las filas. No escala y es más propensa a errores de redondeo.

### D4. Pantallas con Recharts cargado solo en los reportes
- **Dependencia:** `recharts@3.10.1`, compatible con React 19.
- **Carga diferida:** los gráficos viven en `features/admin/reportes/components/grafico-*.tsx` y se cargan con `next/dynamic` (`ssr: false`) desde los contenedores. Recharts queda en un chunk aparte y no pesa en la tienda.
- **Colores:** los gráficos usan los tokens CSS del sistema de diseño (`var(--color-primary)` y otros), así que funcionan en modo claro y oscuro.
- **Accesibilidad:** el gráfico es `aria-hidden` y la tabla que lo acompaña lleva los datos.
- **Filtro:** un formulario con dos `<input type="date">` que, al aplicarse, hace `router.replace` con `?desde&hasta`. La consulta de React Query usa los `searchParams` como clave.
- **`AdminShell`:** suma tres enlaces, "Reglas", "Reporte de ventas" y "Reporte del asistente".
- **Reglas:** `/admin/reglas` muestra una tarjeta por regla, con `Switch` y `Input type="number"`. Cada tarjeta guarda por separado con `useMutation`, y el error de la API se muestra en el `FormField` del parámetro.

### D5. Reconciliación con la unión de reservas
- **`ReconciliacionService.reconciliar()`:** en una sola consulta, para tener una instantánea coherente, lee:
  - el stock físico de los productos activos;
  - los ítems de las reservas `ACTIVA` con `vence_en > now()`, como `{ reservaId, productoId, cantidad }`.
- **`Inventario.reconciliar(fisicos, reservasPostgres)`:** por producto, calcula `reservado = Σ reserva_items del objeto + Σ ítems de Postgres cuya reserva no está en la tabla reservas del objeto`.
  - Las reservas de Postgres van como tercer parámetro opcional, después de `ahora`, para que las llamadas y pruebas existentes sigan valiendo.
  - El resto no cambia: expira primero y escribe solo si el valor difiere.
- **Por qué la unión:**
  - una reserva en vuelo, que ya está en el objeto y todavía no en Postgres, se cuenta por el objeto;
  - una reserva que el objeto perdió se cuenta por Postgres;
  - una que está en los dos se cuenta una sola vez.
- **Carrera con una confirmación:** la reserva puede confirmarse después de la lectura. En ese caso, la lectura tiene el físico anterior y la reserva como activa, así que `físico − 1` coincide con el físico nuevo. Es correcto.
- **Carrera con una cancelación:** la reserva puede cancelarse después de la lectura. Entonces se descuenta una unidad de más hasta la siguiente reconciliación, 5 minutos después. Ese error es seguro, porque deja menos disponible y nunca causa sobreventa.

### D6. Endpoint de pruebas condicionado al entorno
- **`pruebas/pruebas.module.ts`:** se registra en `AppModule` solo si `env.PRUEBAS_HABILITADAS === 'true'`. Si no, se usa `comun/modulo-vacio.ts`, el patrón que ya existe, y la ruta no existe (404).
- **La ruta:** `POST /pruebas/inventario/vaciar` exige ADMIN, como defensa adicional, y llama a `Inventario.vaciar()`.
  - **`vaciar()`:** cuenta las filas, ejecuta `ctx.storage.deleteAll()` y vuelve a crear las tablas con el mismo DDL del constructor, extraído a una función. Devuelve `{ productos, reservas }` borrados.
- **Variable:** `PRUEBAS_HABILITADAS` va en `.dev.vars.example` y en los vars de las pruebas de integración y de Playwright. Nunca va en `wrangler.jsonc`.
- **Garantías:**
  - una prueba unitaria lee `wrangler.jsonc` y falla si la variable aparece (como la de `HORARIOS`);
  - una prueba de integración sin la variable recibe 404;
  - un escenario `@humo` comprueba el 404 en producción.

### D7. Escenarios k6 y su ejecución

| Escenario | Archivo | Entorno | Datos |
|---|---|---|---|
| Concurrencia | `reserva_concurrente.js` (ya existe) | Producción (`workers.dev`) | 1 producto de 5 unidades y 300 clientes |
| Idempotencia | `idempotencia.js` | Producción (`workers.dev`) | 1 producto de 5 unidades y 5 clientes |
| Expiración | `expiracion.js` | Local, con `RESERVA_TTL_MIN=1` | 1 producto de 5 unidades, 5 + 50 clientes |
| Pérdida del almacén | `perdida_almacen.js` | Local, con `PRUEBAS_HABILITADAS` | 1 producto de 5 unidades, 2 + 50 clientes y 1 ADMIN |

- **`preparar.mjs`:** gana `--escenario <nombre>` y escribe `datos.json`, que está ignorado por Git, con cookies, ids y unidades.
- **`verificar.mjs`:** comprueba los invariantes de la spec, borra lo creado por la corrida (órdenes, comprobantes, notificaciones, reservas, sesiones, usuarios y producto) e imprime un resumen.
- **Idempotencia:**
  1. cada VU hace `POST /reservas`;
  2. luego, con `http.batch`, envía 5 `POST /pagos/confirmar` con la misma `Idempotency-Key` y la tarjeta 4242;
  3. los umbrales exigen un único id de orden por VU, y la verificación exige 5 órdenes en total.
  - **Efecto lateral aceptado:** consume 5 números del correlativo de comprobantes en producción. Queda documentado.
- **Expiración:**
  1. la primera oleada reserva 5 unidades;
  2. el script espera 65 s y dispara la expiración con `GET /__scheduled?cron=*+*+*+*+*`, igual que en `wrangler dev --test-scheduled`;
  3. la segunda oleada, de 50 VUs, debe lograr exactamente 5 reservas.
- **Pérdida del almacén:**
  1. se hacen 2 reservas y el ADMIN vacía el almacén;
  2. el script comprueba que `GET /productos/:id` muestra disponible 3, por la reconstrucción perezosa;
  3. vuelve a vaciar y dispara la reconciliación (`cron=*/5+*+*+*+*`);
  4. comprueba que el disponible es 3 y que una oleada de 50 VUs logra exactamente 3 reservas.
- **Exportación:** cada script usa `handleSummary` para escribir `tests/k6/resultados/<escenario>-<entorno>-<fecha>.json`. Los JSON se versionan, porque no tienen cookies ni secretos.
- **Postgres local:** necesita `max_connections=400`, como en el Sprint 3.

### D8. Revisión de seguridad con evidencia
Un script `scripts/seguridad-produccion.mjs` hace solo peticiones a `api.xdtech.store` y a `xdtech.store/cdn-cgi/trace`, sin servicios de terceros. Comprueba:
1. que `Set-Cookie` del login de una cuenta desechable lleva `HttpOnly`, `Secure`, `SameSite=Lax` y `Domain=xdtech.store`;
2. que un `Origin: https://ejemplo.invalid` no recibe `Access-Control-Allow-Origin` y que el origen del frontend sí lo recibe, con credenciales;
3. que la IP de `/cdn-cgi/trace` coincide con la que la API usa como clave. Se observa con `wrangler tail` en un `POST /auth/login` fallido;
4. que con `X-Forwarded-For` distinto en cada petición, los intentos de inicio de sesión de un correo inexistente igual reciben 429 al superar el límite;
5. que `/pruebas/inventario/vaciar` responde 404.

El conteo de sesiones vencidas lo hace el mismo script, con `DIRECT_URL` cargada con `Read-Host`, y debe ser 0 tras la limpieza diaria. El resto de la lista se revisa en el código y se anota en `docs/compatibilidad-cloudflare.md` con su evidencia:
- hash;
- guardas en cada ruta admin, cubierto por `rutas-admin.e2e.test.ts`;
- DTOs: todo `@Body` y `@Query` con clase validada;
- límite del asistente.

### D9. Escaneo de secretos con gitleaks
- **En la CI:** un paso nuevo en el job `verificar` corre gitleaks, en versión fija, sobre todo el historial (checkout con `fetch-depth: 0`).
- **Excepciones:** `.gitleaks.toml` extiende la configuración por defecto con una lista de permitidos para las contraseñas de Postgres local de `docker-compose`, los `.example` y las cadenas de prueba.
- **Revisión inicial:** se corre una vez en local sobre el historial completo. Si aparece un secreto real, se avisa al usuario para rotarlo; no se reescribe el historial sin su decisión.
- **Alternativa descartada:** un script propio con expresiones regulares. Gitleaks mantiene las reglas de los proveedores, incluida la clave de Anthropic.

## Risks / Trade-offs

- **[Riesgo]** La CPU del plan gratuito (10 ms) se supera en las ráfagas de k6 → ya pasó en el Sprint 3 sin cortes. Se registra la CPU con `wrangler tail`. Si aparece `Exceeded CPU`, se documenta junto con la salida al plan de pago.
- **[Riesgo]** El reporte de ventas en un rango de 366 días con muchas órdenes → los índices por fecha y una agregación de 3 consultas lo cubren a escala académica. Sin caché.
- **[Trade-off]** El costo del asistente usa el precio del modelo vigente, no el de la consulta → se acepta. La pantalla lo rotula como «estimado».
- **[Riesgo]** Al vaciar el almacén, quedan reservas que el objeto no conoce. Cuando vencen, no devuelven unidades al objeto hasta la siguiente reconciliación → el disponible queda por debajo del real, nunca por encima, durante 5 minutos como máximo. Se documenta.
- **[Riesgo]** La comprobación 4 de D8 deja la IP del desarrollador bloqueada en el inicio de sesión durante la ventana (15 min) → se avisa antes de correrla y se hace al final.
- **[Riesgo]** gitleaks puede marcar falsos positivos en el historial (hashes de prueba o UUID) → se declaran en `.gitleaks.toml` con su motivo, nunca con `--no-git` ni desactivando reglas.
- **[Trade-off]** Recharts suma unos 100 KB → se cargan solo en las rutas de reportes (D4). Se mide el tamaño del chunk.

## Migration Plan

1. **Migración:** índices por `creada_en` y `creado_en`. No toca datos y se aplica con `prisma migrate deploy` en el despliegue normal.
2. **Despliegue:** el Worker y el Durable Object van en el mismo script, así que el nuevo parámetro de `reconciliar` llega a la vez. Como es opcional, una reconciliación vieja sigue funcionando.
3. **Reversión:** se vuelve a desplegar la versión anterior. Los índices pueden quedarse, y las reglas editadas siguen siendo válidas para el motor anterior.
4. **Orden de las verificaciones:**
   1. pruebas locales y en la CI;
   2. despliegue;
   3. `@humo`;
   4. k6 local, con expiración y pérdida;
   5. k6 en producción, con concurrencia e idempotencia;
   6. revisión de seguridad, con la comprobación de IP al final.
