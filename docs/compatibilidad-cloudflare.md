# Compatibilidad con Cloudflare: resultados del Sprint 0

> Registro de las pruebas de humo de HU-36b (parte técnica, sección 2.0). Ningún sprint posterior se apoya en una prueba sin resultado **OK** o sin plan B documentado. Este archivo también es insumo del informe final.
>
> Estados: **OK**, **No OK**, **Parcial** (hay mediciones pero falta completar la prueba) y **Pendiente**.

## Entorno de las pruebas

| Elemento | Versión / valor |
|---|---|
| Node.js | 24.18.0 |
| pnpm | 12.18.0 |
| Wrangler | 4.159.0 |
| workerd (local) | 1.20261109.1 |
| `compatibility_date` | 2026-11-01 |
| NestJS | 12.4.2 (adaptador Express 5.3.0) |
| Next.js / OpenNext | 16.4.6 / @opennextjs/cloudflare 1.20.16 |
| Sistema del desarrollador | Windows 11 Pro |

## Resultados

| # | Prueba | Resultado | Medidas | Decisión |
|---|---|---|---|---|
| 1 | NestJS en Workers | **OK, con dos ajustes** (decididos por el desarrollador el 2026-11-11) | Bundle desplegado: 7.330 KiB sin comprimir y 1.949 KiB con gzip (sin Prisma: 3.254 / 655 KiB). **CPU por petición en producción (`wrangler tail`, 40–60 peticiones por medición), `/health/live` · `/health/ready`:** (1) NestJS en la primera petición y un `PrismaClient` por petición: en caliente 1–2 · 14–24 ms; primera petición de cada isolate 32–128 · hasta 130 ms. (2) Con NestJS en el ámbito global: en caliente 1–4 · 15–79 ms; isolate frío 10–18 ms en `live`. (3) Con un `PrismaClient` por isolate y una conexión por petición: en caliente `ready` 3–8 ms; primera consulta del isolate 54–129 ms. (4) **Con Prisma precalentado en el ámbito global (estado actual): `live` 0–4 ms; `ready` 3–9 ms en caliente y 20–39 ms en la primera consulta de cada isolate.** Ninguna petición falló. Latencia del cliente desde Perú: `/health/live` ~0,45 s | **Seguir con NestJS** (Hono queda descartado). Ajustes: (a) NestJS y Prisma se inicializan en el ámbito global de `src/worker.ts`, donde la CPU cuenta como arranque del isolate y no como CPU de la petición; (b) un `PrismaClient` por isolate con una conexión `pg` por petición (design.md D4). Lo que queda en frío, por encima de los 10 ms, es la primera conexión real (SCRAM-SHA-256 de `pg`, ~4 ms en el perfil local) y la primera compilación de cada consulta. Ocurre una vez por isolate. Se vigila en el Sprint 3 con el escenario de carga |
| 2 | Next.js en Cloudflare | **OK** | Desplegado desde la CI (Linux) en `xdtech.store`, también en `*.workers.dev`. La página se renderiza en servidor en cada petición (marca de tiempo distinta) y su `fetch` en servidor a `api.xdtech.store` responde "API disponible". **En el navegador (Chrome 157, 2026-11-11), «Probar API con credenciales» devuelve 200.** La API responde con `Access-Control-Allow-Origin: https://xdtech.store` y `Allow-Credentials: true`. Worker del frontend: 648 KiB de recursos estáticos. `GET /` local: ~300 ms en la primera petición y ~38 ms en las siguientes | **Frontend en Cloudflare** (sin pasar a Vercel). Se despliega desde Linux (CI): **en Windows el build falla, dentro y fuera de OneDrive** (`EPERM` al crear enlaces simbólicos; con el Modo de desarrollador, "Acceso denegado" al leerlos en `.open-next/server-functions/default/node_modules/.pnpm`). **`cacheComponents`/`partialPrefetching` desactivados:** sin caché incremental, el Partial Prerender colgaba el render en Workers |
| 3 | Prisma con Neon por Hyperdrive | **Parcial: funciona en producción.** Hyperdrive `xdtech-neon` con el caché desactivado (verificado con `wrangler hyperdrive get`). `/health/ready` en `api.xdtech.store` responde `postgres: ok` con Prisma 7.10.1 y `adapter-pg`. Faltan los subrequests por consulta y la comprobación de lectura inmediata tras una escritura | **Producción (2026-11-11, `wrangler tail`):** con Neon suspendida (más de 6 min sin uso), la primera `/health/ready` tarda 877 ms de pared (incluye ~120 ms del Durable Object); con Neon despierta, 170–380 ms. CPU de `/health/ready`: 14–24 ms en caliente y hasta 130 ms en isolates fríos. Local: ~87 ms en la primera petición | En las pruebas de Vitest dentro de workerd, `pg` no carga `pg-cloudflare` (falta la condición `workerd` en `require`). Por eso las pruebas con base de datos corren con `createTestHarness` de Wrangler, que empaqueta como en producción. **La CPU de Prisma en caliente ya supera los 10 ms del plan gratuito**: entra en la decisión de la prueba 1 |
| 4 | Almacén de disponibilidad (opción B, Durable Object) | **Parcial: OK en local.** Atomicidad comprobada: 300 reservas concurrentes sobre 5 unidades dan exactamente 5 éxitos y disponible 0, dentro de workerd (Vitest) y por HTTP a través del Worker completo (`tests/prototipos/reservas-300.ts`, 3 de 3 corridas aceptadas). Reserva de varios productos todo o nada; `NO_INICIALIZADO` nunca se trata como 0. Falta una corrida en producción | **Filas escritas:** 4 por reserva de un producto y 2 + 2·N para N productos (tablas `WITHOUT ROWID`; con rowid eran 6). Con 100.000 filas por día, eso da ~25.000 reservas de un producto por día. **Local (Windows, `wrangler dev`):** espera en el objeto p50 40–68 ms y p95 99–112 ms; latencia del cliente con 300 conexiones simultáneas p50 ~0,85–1,05 s (domina el proxy local) | Pendiente de la corrida en producción para confirmar la opción B con la regla de la sección 5.3 |
| 5 | Hash de contraseñas (PBKDF2, Web Crypto) | Pendiente | — | — |
| 6 | Cookie entre subdominios | **Parcial: OK en Chrome y en Brave**; falta Firefox o Safari | La API (`POST /__prueba/cookie`) emite `xd_prueba=…; Max-Age=600; Domain=.xdtech.store; Path=/; HttpOnly; Secure; SameSite=Lax`. Desde `https://xdtech.store/pruebas/cookie`, con `credentials: 'include'`, **Chrome 157 y Brave en Windows (2026-11-11) devuelven la cookie a `api.xdtech.store`**: el valor recibido coincide con el emitido. Brave cuenta como dato adicional (bloquea más rastreo que Chrome), pero usa el mismo motor, Chromium, y su User-Agent es idéntico al de Chrome | Pendiente de Firefox o Safari, que la spec exige como segundo navegador |
| 7 | IP real (`CF-Connecting-IP`) | **OK** | Desde `api.xdtech.store` y desde `*.workers.dev` (2026-11-11), `CF-Connecting-IP` devuelve la IP pública del cliente (IPv6). `X-Forwarded-For` llega vacío. **La IP del socket que expone `httpServerHandler` coincide con `CF-Connecting-IP`**, al contrario de lo que se suponía | Usar `CF-Connecting-IP` de forma explícita en el límite de peticiones del Sprint 1, porque es la cabecera documentada y Cloudflare la reescribe en el borde. Como llegan direcciones IPv6, agrupar los intentos por prefijo /64 |
| 8 | Cron Trigger | **OK** | En local, `wrangler dev --test-scheduled` y `/__scheduled?cron=...` ejecutan `expirar`, `reconciliar` y `limpiarSesiones`, y un cron desconocido solo registra una advertencia. En producción (`wrangler tail`, 2026-11-11 02:20 UTC): `* * * * *` ejecuta `expirar` y `*/5 * * * *` ejecuta `reconciliar`, ambos con resultado Ok | Se mantienen los tres crons de D3 |
| 9 | Subrequests por reserva | Pendiente | — | — |

## Decisiones

### Tomadas por el desarrollador (2026-11-10)

| Tema | Decisión | Motivo |
|---|---|---|
| Node.js | 24 en local y en la CI | Es la versión instalada en el equipo de desarrollo |
| Acceso a Neon | Cloudflare Hyperdrive con Prisma y `@prisma/adapter-pg`; caché de consultas **desactivado** | Mantener la conexión dentro de Cloudflare. Sin caché, las lecturas de stock y de sesiones siempre son actuales |
| Almacén de disponibilidad | Opción B: Durable Object `Inventario` con SQLite. Upstash queda como respaldo | Cloudflare no ofrece un Redis propio, y KV no sirve (es eventualmente consistente). La prueba 4 debe confirmar la opción con la regla de la sección 5.3 |
| Gestor de paquetes, pruebas | pnpm workspaces y Vitest | Ver design.md (P1, P2) |
| Repositorio | GitHub, rama `main`, público | Ver design.md (P6) |

### Hallazgos técnicos

- **Primer despliegue (2026-11-11):** el job `desplegar` de la CI aplica las migraciones en Neon y publica la API en `api.xdtech.store` y el frontend en `xdtech.store` (Custom Domains con certificado válido; `www.xdtech.store` responde 308 hacia el apex). `/health/ready` en producción: Postgres por Hyperdrive y almacén `ok`. Los subdominios `*.workers.dev` quedan activos para diagnóstico.
- **Perfilado de CPU de `/health/ready` (2026-11-11).** En producción, la API de perfilado (`POST /accounts/…/workers/workers/xdtech-api/versions/latest/profile`) respondió 200 en tres capturas de 15–25 s con tráfico sostenido, pero perfila un isolate elegido entre las ejecuciones recientes, que no fue el que atendía ese tráfico: solo registró recolector de basura e inactividad (12–28 muestras). Por eso se perfiló el mismo bundle en `workerd` local (`wrangler dev` con el inspector de V8, 200 peticiones en caliente, muestreo cada 100 µs, contra el Postgres de Docker). Los milisegundos locales no son los de producción; sirven las proporciones. Puntos calientes por petición:
  - **PBKDF2 de la autenticación SCRAM-SHA-256 de `pg`** (`deriveKey`, `pg/lib/crypto/utils-webcrypto`): ~4,1 ms, el 10 % de la CPU. Se paga en cada conexión nueva, y hoy se abre una por petición. Falta confirmar si Hyperdrive también pide SCRAM a la conexión del Worker.
  - **Construcción de un `PrismaClient` por petición:** al crearse, deserializa el `parameterizationSchema` desde base64url con el polyfill de `Buffer` de Prisma (`[...atob(s)].map(...)`), lo que suma ~3,2 ms (≈8 %). Además crea un `QueryCompiler` nuevo y una caché de planes de consulta vacía, así que cada consulta se vuelve a compilar en WASM (~2,5 ms en funciones WASM).
  - El resto se reparte entre el puente `node:http` ↔ `fetch` de `httpServerHandler` (`#toReqRes`, ~3,4 ms) y Express/NestJS.
- **Cambio aplicado (2026-11-11):** un solo `PrismaClient` por isolate, con un adaptador que delega cada consulta en una conexión `pg` de la petición en curso (`AsyncLocalStorage`). Así no se comparte E/S entre peticiones, el esquema se deserializa una sola vez y se conserva la caché de planes. Perfil local de `/health/ready` después del cambio: **42,1 → 30,4 ms de CPU por petición (−28 %)**; desaparecen la deserialización del esquema y la recompilación en WASM, y queda el PBKDF2 de SCRAM. En producción, ver la prueba 1.
- **Escáneres:** minutos después de publicar llegan peticiones automáticas a `/.env` y `/.git/HEAD`; responden 404 sin contenido.

- **NestJS y esbuild:** esbuild, que Wrangler usa para empaquetar, no genera `emitDecoratorMetadata`. Por eso `tsc` compila a `dist/` y Wrangler empaqueta esa salida mediante `build.command`. En las pruebas, SWC cumple ese papel.
- **Dependencias opcionales de NestJS:** `@nestjs/microservices` y `@nestjs/websockets` se redirigen a un módulo vacío con `alias` en `wrangler.jsonc`.
- **Pruebas en workerd:** `@cloudflare/vitest-pool-workers` está obsoleto. Se usa `@cloudflare/vitest-plugin`.
- **OpenNext sin R2:** se configura sin la caché incremental en R2, porque R2 está fuera del stack y el frontend renderiza por petición.

### Por confirmar con pruebas antes del Sprint 1

- Confirmación de la opción B (prueba 4).
- Cookie entre subdominios e IP real (pruebas 6 y 7).
