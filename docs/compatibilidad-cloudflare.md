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
| 1 | NestJS en Workers | **Parcial**: funciona en producción (`api.xdtech.store`), con Prisma incluido. Falta decidir qué hacer con la CPU del arranque en frío | Bundle desplegado: 7.330 KiB sin comprimir y 1.949 KiB con gzip (sin Prisma: 3.254 / 655 KiB). **CPU en producción (`wrangler tail`, 2026-11-11):** `/health/live` en caliente 1–2 ms; **primera petición de cada isolate (inicialización de NestJS) 32–88 ms**; `/health/ready` 14–55 ms (Prisma con WASM y `pg`), con 210–460 ms de tiempo de pared. Ninguna petición falló, pero el arranque en frío supera los 10 ms de CPU por petición del plan gratuito. Latencia del cliente desde Perú: `/health/live` ~0,45 s | **Pendiente del desarrollador**: (a) seguir con NestJS y mover la inicialización (que no hace E/S) al ámbito global del módulo, donde cuenta como tiempo de arranque y no como CPU de la petición; (b) pasar a Hono |
| 2 | Next.js en Cloudflare | **Parcial: OK en producción, salvo el clic en el navegador.** Desplegado desde la CI (Linux) en `xdtech.store`, también en `*.workers.dev`. La página se renderiza en servidor en cada petición (marca de tiempo distinta) y su `fetch` en servidor a `api.xdtech.store` responde "API disponible". La API devuelve `Access-Control-Allow-Origin: https://xdtech.store` con `Allow-Credentials: true`. Falta pulsar «Probar API con credenciales» en un navegador | Worker del frontend: 648 KiB de recursos estáticos. `GET /` local: ~300 ms en la primera petición y ~38 ms en las siguientes | Desplegar desde Linux (CI). **En Windows el build falla, dentro y fuera de OneDrive** (`EPERM` al crear enlaces simbólicos; con el Modo de desarrollador, "Acceso denegado" al leerlos en `.open-next/server-functions/default/node_modules/.pnpm`). **`cacheComponents`/`partialPrefetching` desactivados:** sin caché incremental, el Partial Prerender colgaba el render en Workers |
| 3 | Prisma con Neon por Hyperdrive | **Parcial: funciona en producción.** Hyperdrive `xdtech-neon` con el caché desactivado (verificado con `wrangler hyperdrive get`). `/health/ready` en `api.xdtech.store` responde `postgres: ok` con Prisma 7.10.1 y `adapter-pg`. Faltan los subrequests por consulta y la comprobación de lectura inmediata tras una escritura | **Producción (2026-11-11, `wrangler tail`):** con Neon suspendida (más de 6 min sin uso), la primera `/health/ready` tarda 877 ms de pared (incluye ~120 ms del Durable Object); con Neon despierta, 170–380 ms. CPU de `/health/ready`: 14–24 ms en caliente y hasta 130 ms en isolates fríos. Local: ~87 ms en la primera petición | En las pruebas de Vitest dentro de workerd, `pg` no carga `pg-cloudflare` (falta la condición `workerd` en `require`). Por eso las pruebas con base de datos corren con `createTestHarness` de Wrangler, que empaqueta como en producción. **La CPU de Prisma en caliente ya supera los 10 ms del plan gratuito**: entra en la decisión de la prueba 1 |
| 4 | Almacén de disponibilidad (opción B, Durable Object) | **Parcial: OK en local.** Atomicidad comprobada: 300 reservas concurrentes sobre 5 unidades dan exactamente 5 éxitos y disponible 0, dentro de workerd (Vitest) y por HTTP a través del Worker completo (`tests/prototipos/reservas-300.ts`, 3 de 3 corridas aceptadas). Reserva de varios productos todo o nada; `NO_INICIALIZADO` nunca se trata como 0. Falta una corrida en producción | **Filas escritas:** 4 por reserva de un producto y 2 + 2·N para N productos (tablas `WITHOUT ROWID`; con rowid eran 6). Con 100.000 filas por día, eso da ~25.000 reservas de un producto por día. **Local (Windows, `wrangler dev`):** espera en el objeto p50 40–68 ms y p95 99–112 ms; latencia del cliente con 300 conexiones simultáneas p50 ~0,85–1,05 s (domina el proxy local) | Pendiente de la corrida en producción para confirmar la opción B con la regla de la sección 5.3 |
| 5 | Hash de contraseñas (PBKDF2, Web Crypto) | Pendiente | — | — |
| 6 | Cookie entre subdominios | Pendiente | — | — |
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
- **Escáneres:** minutos después de publicar llegan peticiones automáticas a `/.env` y `/.git/HEAD`; responden 404 sin contenido.

- **NestJS y esbuild:** esbuild, que Wrangler usa para empaquetar, no genera `emitDecoratorMetadata`. Por eso `tsc` compila a `dist/` y Wrangler empaqueta esa salida mediante `build.command`. En las pruebas, SWC cumple ese papel.
- **Dependencias opcionales de NestJS:** `@nestjs/microservices` y `@nestjs/websockets` se redirigen a un módulo vacío con `alias` en `wrangler.jsonc`.
- **Pruebas en workerd:** `@cloudflare/vitest-pool-workers` está obsoleto. Se usa `@cloudflare/vitest-plugin`.
- **OpenNext sin R2:** se configura sin la caché incremental en R2, porque R2 está fuera del stack y el frontend renderiza por petición.

### Por confirmar con pruebas antes del Sprint 1

- Confirmación de la opción B (prueba 4).
- NestJS o Hono (prueba 1).
- Frontend en Cloudflare o en Vercel (prueba 2).
- Cookie entre subdominios e IP real (pruebas 6 y 7).
