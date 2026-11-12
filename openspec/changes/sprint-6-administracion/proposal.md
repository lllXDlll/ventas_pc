# Proposal

## Why

La tienda ya vende, arma PCs a mano y con IA. Al administrador todavía le faltan herramientas: solo gestiona productos y stock. No puede ajustar las reglas de compatibilidad sin tocar la base, ni ver cuánto se vende o cuánto se usa y cuesta el asistente (`docs/sprint_06_administracion.md`).

Además, el proyecto debe demostrar su consistencia ante alta demanda con el escenario completo de k6 y cerrar una revisión de seguridad antes del despliegue final del Sprint 7.

## What Changes

**Gestión de reglas (HU-15)**
- **`GET /admin/reglas`:** lista las seis reglas con su estado, sus parámetros y la descripción de cada parámetro (tipo, mínimo, máximo y unidad), para que el panel arme el formulario.
- **`PATCH /admin/reglas/:codigo`:** activa o desactiva una regla y edita sus parámetros.
  - Los parámetros se validan con un esquema por regla. Hoy solo `POTENCIA` tiene parámetros: `margenPorcentaje` (entero de 0 a 100) y `consumoBaseW` (entero de 0 a 500). Las demás no aceptan ninguno.
  - Un valor inválido o una clave desconocida responde 400 con un mensaje que nombra el parámetro.
- **Aplicación inmediata:** el motor ya lee las reglas de la base en cada validación, así que el cambio aplica a la siguiente validación, sin caché que invalidar. También aplica al asistente y al carrito.
- **Pantalla `/admin/reglas`:** una tarjeta por regla, con un interruptor y los campos de sus parámetros.

**Reporte de ventas (HU-33)**
- **`GET /admin/reportes/ventas?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`:** fechas inclusivas en hora de Lima. Por defecto cubre los últimos 30 días, con un máximo de 366.
- **Contenido:** total vendido, número de órdenes, ticket promedio, los 10 productos más vendidos (unidades e importe) y la serie por día (total y órdenes).
- **Pantalla `/admin/reportes/ventas`:** filtro de fechas, indicadores, gráfico de barras por día y tabla de productos.

**Reporte del asistente (HU-34)**
- **`GET /admin/reportes/asistente?desde&hasta`:** mismas reglas de fechas.
- **Contenido:**
  - número de consultas, porcentaje con respaldo y latencia promedio;
  - distribución por uso previsto (consultas y respaldo por uso);
  - distribución de los motivos de respaldo;
  - tokens de entrada y salida, y costo estimado en US$, calculado con el precio de Opus 5.5 guardado como constante. Así se evalúa el costo, como pide la historia.
- **Pantalla `/admin/reportes/asistente`:** filtro, indicadores, gráfico de barras por uso y tabla de motivos.
- **Gráficos:** con **Recharts** (decisión del usuario). Cada gráfico va acompañado de su tabla, para que la información sea accesible sin el gráfico.

**Pruebas de carga completas (HU-37b)**
- **Dónde se corren:** en modo mixto (decisión del usuario).
  - **Contra producción, como en el Sprint 3:**
    - 300 VUs sobre 5 unidades, que deben dar exactamente 5 reservas;
    - reintentos concurrentes de pago con la misma `Idempotency-Key`, que deben dar una sola orden;
    - comprobación de que las órdenes nunca superan el stock y el stock físico nunca es negativo.
  - **En local (`wrangler dev`):**
    - expiración con `RESERVA_TTL_MIN=1`: las reservas no pagadas se liberan y una segunda oleada obtiene esas unidades;
    - pérdida del almacén: se vacía el Durable Object `Inventario` y se comprueba que la reconstrucción y la reconciliación restauran el disponible correcto.
- **Endpoint de pruebas `POST /pruebas/inventario/vaciar`:** solo existe si `PRUEBAS_HABILITADAS="true"` (solo en local y en la CI), y sin esa variable responde 404. Nunca se define en `wrangler.jsonc` de producción, y una prueba lo verifica.
- **Exportación:** cada escenario guarda su resumen en `tests/k6/resultados/` (JSON) y los resultados quedan en `docs/compatibilidad-cloudflare.md` para el informe.

**Corrección de la reconciliación tras perder el almacén**
- Hoy la reconciliación calcula `físico − reservas que conoce el propio objeto`. Si el almacenamiento se pierde, el objeto ya no conoce las reservas activas en Postgres y dejaría disponible de más, lo que podría causar sobreventa.
- **Nuevo cálculo:** descuenta la unión, por id, de las reservas del objeto y las reservas `ACTIVA` vigentes en Postgres. Se usa la unión para no descontar dos veces y para no pisar una reserva en vuelo.

**Endurecimiento de seguridad (transversal)**
- **Revisión con evidencia** de cada punto de la lista del sprint:
  - hash PBKDF2 de 50.000 iteraciones;
  - sesiones con vencimiento;
  - `@Roles('ADMIN')` en todas las rutas `/admin`, que ya cubre una prueba que recorre las rutas, ahora incluidas las nuevas;
  - DTOs con `forbidNonWhitelisted`;
  - límites en el Durable Object `Limites` con `CF-Connecting-IP`;
  - limpieza de sesiones;
  - cookie y CORS.
- **Verificación en producción:**
  - la IP detectada es la real y un `X-Forwarded-For` falso no evita el límite;
  - la tabla `sesiones` no acumula sesiones vencidas;
  - la cookie sale con `HttpOnly; Secure; SameSite=Lax`;
  - un origen ajeno no recibe cabeceras CORS.
- **Escaneo de secretos:** con gitleaks sobre todo el historial y como paso de la CI, para que un secreto confirmado haga fallar la verificación.
- **Informe:** el resultado de la revisión queda en `docs/compatibilidad-cloudflare.md`.

**Navegación del panel**
- **`AdminShell`:** suma "Reglas", "Reporte de ventas" y "Reporte del asistente" junto a "Catálogo".

## Capabilities

### New Capabilities
- `gestion-reglas`: consulta y edición de las reglas de compatibilidad por el administrador (API, validación de parámetros por regla y pantalla del panel).
- `reportes`: reportes administrativos de ventas y de uso del asistente, con filtro por fechas, indicadores, gráfico y tabla.
- `pruebas-carga`: escenarios k6 de concurrencia, idempotencia, expiración y pérdida del almacén, su exportación, y el endpoint de pruebas que solo existe fuera de producción.

### Modified Capabilities
- `disponibilidad`: la reconciliación también descuenta las reservas activas en Postgres que el almacén no conoce, para recuperarse de una pérdida de datos del almacén.
- `entrega-continua`: la verificación en cada push incluye un escaneo de secretos.

## Impact

- **API:**
  - módulo `admin/` nuevo (reglas y reportes);
  - módulo `pruebas/`, que se registra solo con `PRUEBAS_HABILITADAS`;
  - `reservas/inventario.ts` y `disponible.service.ts`: la reconciliación recibe también las reservas activas de Postgres;
  - sin tablas nuevas, porque `reglas_compatibilidad`, `ordenes`, `orden_items` y `uso_asistente` ya existen. Una migración solo agrega los índices de los reportes: `ordenes(creada_en)` y `uso_asistente(creado_en)`.
- **Web:**
  - funcionalidad `admin`: pantallas de reglas y de los dos reportes;
  - dependencia nueva `recharts@3.10.1`, que solo se carga en `/admin`.
- **Pruebas:**
  - unitarias de validación de parámetros y de agregación;
  - de integración de los endpoints;
  - e2e del panel;
  - k6: `tests/k6/` con escenarios y scripts de preparación y verificación nuevos.
- **CI:** paso de gitleaks en el job de verificación; `PRUEBAS_HABILITADAS="true"` en el entorno de las pruebas.
- **Documentación:** resultados de k6 y de la revisión de seguridad en `docs/compatibilidad-cloudflare.md`; reportes y reglas en `docs/00_parte_tecnica.md`.
