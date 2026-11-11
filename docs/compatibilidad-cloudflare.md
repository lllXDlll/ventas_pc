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
| 1 | NestJS en Workers | **Parcial**: funciona en local con `wrangler dev`; falta medir el despliegue y repetir con Prisma incluido | Bundle sin Prisma: 3.253,67 KiB sin comprimir y 655,02 KiB con gzip. Primera petición en local, incluida la inicialización de NestJS: ~54 ms (tiempo de pared). Peticiones siguientes: ~9 ms. Falta: CPU por petición y arranque en frío en producción | Seguir con NestJS mientras no aparezca un resultado en contra |
| 2 | Next.js en Cloudflare | **Parcial**: `next build` OK (`/` con *Partial Prerender*); el empaquetado de OpenNext falla en Windows por `EPERM: symlink` | — | Pendiente. Para compilar en local hace falta el Modo de desarrollador de Windows (o WSL); en la CI (Linux) no aplica |
| 3 | Prisma con Neon por Hyperdrive | Pendiente | — | — |
| 4 | Almacén de disponibilidad (opción B, Durable Object) | Pendiente | — | — |
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
