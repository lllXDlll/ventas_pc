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
| 1 | NestJS en Workers | **Parcial**: funciona en local con `wrangler dev`, con Prisma incluido; falta medir el despliegue | Bundle sin Prisma: 3.253,67 KiB sin comprimir y 655,02 KiB con gzip. **Con Prisma 7 (compilador de consultas en WASM de 3,4 MB): 7.319,07 KiB sin comprimir y 1.946,03 KiB con gzip.** Primera petición en local, incluida la inicialización de NestJS: ~54–70 ms (tiempo de pared). Peticiones siguientes: ~9 ms. Falta: CPU por petición y arranque en frío en producción | Seguir con NestJS. Vigilar el tamaño: el gzip ronda 1,9 MiB y el límite comprimido del plan gratuito (a reconfirmar) sería de 3 MiB |
| 2 | Next.js en Cloudflare | **Parcial**: `next build` OK (`/` con *Partial Prerender*); el empaquetado de OpenNext funciona en la CI (Linux, ejecución 42932963107) y falla en Windows por `EPERM: symlink`; falta desplegar y probar SSR y `fetch` con credenciales | — | Desplegar desde la CI (Linux). Para compilar en Windows hace falta el Modo de desarrollador (o WSL) |
| 3 | Prisma con Neon por Hyperdrive | **Parcial**: Hyperdrive `xdtech-neon` creado con el caché desactivado (verificado con `wrangler hyperdrive get`). En local (`localConnectionString` hacia Docker), Prisma 7.10.1 con `adapter-pg` responde en `/health/ready`; con Postgres apagado, la respuesta es 503 e identifica a `postgres` | `/health/ready` en local: ~87 ms en la primera petición. Falta: latencia contra Neon (suspendida y despierta), subrequests y lectura inmediata tras escritura, en producción | En las pruebas de Vitest dentro de workerd, `pg` no carga `pg-cloudflare` (falta la condición `workerd` en `require`). Por eso las pruebas con base de datos corren con `createTestHarness` de Wrangler, que empaqueta como en producción |
| 4 | Almacén de disponibilidad (opción B, Durable Object) | **Parcial: OK en local.** Atomicidad comprobada: 300 reservas concurrentes sobre 5 unidades dan exactamente 5 éxitos y disponible 0, dentro de workerd (Vitest) y por HTTP a través del Worker completo (`tests/prototipos/reservas-300.ts`, 3 de 3 corridas aceptadas). Reserva de varios productos todo o nada; `NO_INICIALIZADO` nunca se trata como 0. Falta una corrida en producción | **Filas escritas:** 4 por reserva de un producto y 2 + 2·N para N productos (tablas `WITHOUT ROWID`; con rowid eran 6). Con 100.000 filas por día, eso da ~25.000 reservas de un producto por día. **Local (Windows, `wrangler dev`):** espera en el objeto p50 40–68 ms y p95 99–112 ms; latencia del cliente con 300 conexiones simultáneas p50 ~0,85–1,05 s (domina el proxy local) | Pendiente de la corrida en producción para confirmar la opción B con la regla de la sección 5.3 |
| 5 | Hash de contraseñas (PBKDF2, Web Crypto) | Pendiente | — | — |
| 6 | Cookie entre subdominios | Pendiente | — | — |
| 7 | IP real (`CF-Connecting-IP`) | Pendiente | — | — |
| 8 | Cron Trigger | **Parcial**: OK en local; falta comprobarlo en producción | En local, `wrangler dev --test-scheduled` y `/__scheduled?cron=...` ejecutan `expirar`, `reconciliar` y `limpiarSesiones`, y un cron desconocido solo registra una advertencia | — |
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

- **NestJS y esbuild:** esbuild, que Wrangler usa para empaquetar, no genera `emitDecoratorMetadata`. Por eso `tsc` compila a `dist/` y Wrangler empaqueta esa salida mediante `build.command`. En las pruebas, SWC cumple ese papel.
- **Dependencias opcionales de NestJS:** `@nestjs/microservices` y `@nestjs/websockets` se redirigen a un módulo vacío con `alias` en `wrangler.jsonc`.
- **Pruebas en workerd:** `@cloudflare/vitest-pool-workers` está obsoleto. Se usa `@cloudflare/vitest-plugin`.
- **OpenNext sin R2:** se configura sin la caché incremental en R2, porque R2 está fuera del stack y el frontend renderiza por petición.

### Por confirmar con pruebas antes del Sprint 1

- Confirmación de la opción B (prueba 4).
- NestJS o Hono (prueba 1).
- Frontend en Cloudflare o en Vercel (prueba 2).
- Cookie entre subdominios e IP real (pruebas 6 y 7).
