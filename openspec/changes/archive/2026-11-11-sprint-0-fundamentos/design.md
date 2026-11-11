# Design

## Context

La carpeta del proyecto solo contiene `docs/` y la configuración de OpenSpec. No es un repositorio Git ni hay código, `package.json` o remoto en GitHub. Los motivos están en proposal.md (Why). Las restricciones vienen de `docs/00_parte_tecnica.md` (que manda ante cualquier diferencia) y de `docs/01_arquitectura_despliegue.md`:

- La API corre como Worker: NestJS con adaptador Express, expuesto con `httpServerHandler` de `cloudflare:node`. No guarda estado en memoria y no puede usar binarios nativos, `fs`, `child_process`, `worker_threads` ni WebSockets.
- Plan gratuito de Workers: 10 ms de CPU, 50 subrequests y 128 MB por petición, y 5 Cron Triggers por cuenta.
- La base de datos es Neon con Prisma. Por decisión del desarrollador, el Worker accede a ella mediante Cloudflare Hyperdrive (esto difiere de la parte técnica, que menciona el adaptador de Neon). Las migraciones usan la cadena directa y solo se aplican en CI.
- Por decisión del desarrollador, el almacén de disponibilidad es la opción B (Durable Object). La parte técnica lo dejaba por decidir.
- Nada de colas, balanceadores ni otras bases de datos.

## Goals / Non-Goals

**Goals:**
- Un esqueleto que despliegue de punta a punta (código → CI → Cloudflare) y que los sprints siguientes llenen sin cambiar su estructura.
- Que cada prueba de HU-36b sea reproducible: un script o un comando documentado, no solo un resultado anotado a mano.
- Que la opción B del almacén quede confirmada con números (atomicidad, latencia, filas escritas) frente a la regla de la sección 5.3, o descartada con motivo.
- Que la elección del almacén no afecte al resto del código: todo pasa por el puerto `DisponibleService`.

**Non-Goals:**
- No implementar `DisponibleService` en producción, ni la expiración, la reconciliación o la limpieza de sesiones (son del Sprint 1 y del Sprint 3). Aquí las tareas programadas solo despachan y registran.
- No hacer pantallas: el frontend es una página vacía más la página de la prueba de cookie.
- No escribir el escenario k6 de 300 usuarios del Sprint 3. La prueba de 300 intentos de este sprint es un script de prototipo.

## Decisions

### D1. Monorepo con pnpm workspaces
Se usa `pnpm-workspace.yaml` con `apps/web` y `apps/api`, sin Turborepo. Con dos aplicaciones, pnpm basta y la CI puede cachear su almacén de paquetes.
*Alternativas:* npm workspaces (más lento y con un manejo peor de las dependencias fantasma), Turborepo o Nx (complejidad que no se necesita con dos apps). → **Pendiente de confirmar, P1.**

### D2. Entrada del Worker con NestJS cacheado por instancia
`src/worker.ts` crea la app NestJS una vez por instancia, en el ámbito global del módulo (con `await` de nivel superior), y guarda la promesa; si falla, se reintenta en la primera petición. Así la CPU de la inicialización cuenta como arranque y no como CPU de la petición (prueba 1). Después hace `app.init()` y la expone con `createServer` de `node:http` y `httpServerHandler`. Exporta `{ fetch, scheduled }`. La inicialización no abre conexiones a Postgres ni al almacén: se conectan cuando se usan, para que `/health/live` no dependa de nada.
*Alternativa:* inicializar en el ámbito global del módulo. Se descarta porque Workers no permite E/S fuera de un handler.

**Hallazgos de implementación:**
- esbuild, que Wrangler usa para empaquetar, no genera `emitDecoratorMetadata`, y sin eso la inyección de dependencias de NestJS no funciona. Por eso `tsc` compila a `dist/`, y Wrangler empaqueta `dist/worker.js` mediante `build.command`, que también funciona con `wrangler dev`. En las pruebas, SWC (`unplugin-swc`) cumple ese papel.
- NestJS importa de forma opcional `@nestjs/microservices` y `@nestjs/websockets`. Con `alias` en `wrangler.jsonc` se redirigen a un módulo vacío, que NestJS trata como "no instalado".
- `@cloudflare/vitest-pool-workers` está obsoleto. Se usa su reemplazo, `@cloudflare/vitest-plugin`.
- Versiones fijadas por compatibilidad: TypeScript 6.0 (typescript-eslint pide < 6.1) y Vitest 4.
- Primera medición, sin Prisma: el bundle pesa 3,25 MiB sin comprimir y 655 KiB con gzip. Con Prisma 7, que trae su compilador de consultas en WASM, sube a 7,3 MiB y 1,95 MiB.
- Prisma 7 genera un `.wasm` y un `.js` que `tsc` no copia; `scripts/copiar-recursos.mjs` los lleva a `dist/`. La CLI se fija en 7.10.1, porque pnpm instalaba una 8.0-rc.
- En el pool de Vitest para Workers hay dos problemas con `require()` en CommonJS. Por un lado, `pg` no recibe la variante `workerd` de `pg-cloudflare`, así que las pruebas con base de datos corren con `createTestHarness` de Wrangler. Por otro, el `loadPackage` de NestJS fallaba de forma intermitente, así que `class-validator` y `class-transformer` se pasan a `ValidationPipe` de forma explícita.
- Durable Object `Inventario`: con tablas `WITHOUT ROWID`, una reserva de un producto escribe 4 filas (6 con rowid). Los errores de validación se devuelven como resultado (`INVALIDA`), sin lanzar excepciones por RPC.
- Frontend: `cacheComponents` y `partialPrefetching` (activos en la plantilla de Next 16.4) colgaban el render en Workers sin caché incremental, así que se desactivan. El build de OpenNext falla en Windows (dentro y fuera de OneDrive) porque no puede leer los enlaces simbólicos de pnpm; se compila y despliega en Linux (CI o contenedor).

### D3. Despacho de Cron por expresión
`scheduled(event)` compara `event.cron` con un mapa `{ "* * * * *": expirar, "*/5 * * * *": reconciliar, "0 4 * * *": limpiarSesiones }`. El mismo mapa está declarado en `wrangler.jsonc`, y una prueba unitaria verifica que coincidan. La limpieza se fija a las 04:00 UTC (23:00 en Perú), fuera de horas de uso.
*Alternativa:* un solo cron que ejecute todo y decida por la hora. Se descarta porque mezcla responsabilidades y rompe la regla de que cada disparo ejecute solo su tarea.

### D4. Neon a través de Hyperdrive, con Prisma y `adapter-pg` (decidido por el desarrollador)
El Worker accede a Neon con un binding de **Cloudflare Hyperdrive** (`HYPERDRIVE`). Prisma usa `@prisma/adapter-pg` con el driver `pg` y la cadena `env.HYPERDRIVE.connectionString`. Hyperdrive mantiene el pool de conexiones cerca de Neon y evita abrir una conexión TCP nueva por petición.
- **Un `PrismaClient` por isolate y una conexión por petición** (cambio de la prueba 1, decidido por el desarrollador el 2026-11-11). El cliente global usa un adaptador que delega cada operación en una conexión `PrismaPg` propia de la llamada a `conPrisma()`, guardada en `AsyncLocalStorage` y cerrada al terminar (`src/datos/prisma.ts`). Así no se comparte E/S entre peticiones, que Workers no permite, y no se repite el costo de construir un cliente por petición (deserializar el esquema de parametrización, un `QueryCompiler` nuevo y la caché de planes vacía). Una prueba de integración con 60 peticiones concurrentes y seguidas lo verifica; con una conexión compartida, la misma prueba falla. Toda consulta debe pasar por `conPrisma()`: fuera de ella, el adaptador lanza un error explícito.
- **Caché de consultas de Hyperdrive desactivado** (`--caching-disabled`). Si estuviera activo, una lectura de stock o de una sesión revocada podría devolver un valor viejo, y eso rompe "Postgres guarda la verdad".
- **Local y CI:** `localConnectionString` del binding (o la variable `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`) apunta al Postgres de Docker. El driver es el mismo que en producción y no hace falta ningún proxy de Neon.
- **Migraciones:** siguen fuera del Worker, con `prisma migrate deploy` y la cadena **directa** de Neon (`DIRECT_URL`). Hyperdrive solo lo usa el Worker.
- Hyperdrive se crea con `wrangler hyperdrive create`, usando la cadena directa de Neon (sin el pooler de Neon, porque Hyperdrive ya agrupa conexiones).
*Alternativa descartada:* `@prisma/adapter-neon` con el driver serverless de Neon. Es el plan B si `adapter-pg` sobre Hyperdrive falla en la prueba 3.

### D5. Almacén de disponibilidad: opción B en Cloudflare (decidido por el desarrollador)
Cloudflare no ofrece un Redis propio. Sus alternativas son KV, descartado por la parte técnica porque es eventualmente consistente, y Durable Objects. Por eso "el caché dentro de Cloudflare" es la **opción B**: un Durable Object `Inventario` con SQLite, declarado en `wrangler.jsonc` con su migración `new_sqlite_classes`. El prototipo está en `apps/api/src/reservas/prototipos/`, con la interfaz mínima `reservar(items, venceEn)`, y corre en local con el Durable Object de `wrangler dev`, sin piezas en Docker.

La prueba 4 deja de comparar A y B. Ahora **confirma B** con la regla de la sección 5.3: el script `tests/prototipos/reservas-300.ts` lanza 300 peticiones concurrentes y registra las reservas exitosas, el disponible final, la latencia (p50/p95), las filas escritas por reserva con su proyección diaria frente a las 100 000 del plan gratuito, y los subrequests. **Solo si B falla** (atomicidad, latencia inaceptable o filas fuera de cuota) se prototipa la opción A con Upstash, y se registra el motivo.

Los contadores de límite de peticiones de registro e inicio de sesión (Sprint 1) también viven en un Durable Object, `Limites`, separado de `Inventario` para no sumar carga al objeto de reservas. Esa implementación es del Sprint 1; aquí solo se deja declarado el binding.

### D6. `/health/ready` contra el puerto, no contra una implementación
`ready` llama a `prisma.$queryRaw\`SELECT 1\`` (a través de Hyperdrive) y a `DisponibleService.ping()`, cada uno con un tiempo de espera (`HEALTH_TIMEOUT_MS`, por defecto 3000) que tiene en cuenta el arranque de Neon tras estar suspendido. `ping()` llama al método `consultar` del Durable Object `Inventario`. No hay variable para elegir el almacén: si alguna vez hiciera falta pasar a Upstash, solo se cambia la implementación del puerto.

### D7. Hash de contraseñas: PBKDF2-SHA256 con Web Crypto como primera opción
Web Crypto es nativo del runtime y no suma peso al bundle. Se miden 100 000 iteraciones, que según la documentación es el máximo de PBKDF2 en Workers (a confirmar en la prueba 5), y valores menores, y se elige el mayor que quede por debajo de unos 8 ms de CPU. Si ninguno da un costo aceptable, se mide argon2id en WASM (`hash-wasm`). Formato guardado: `pbkdf2$<iteraciones>$<sal>$<hash>`, para poder cambiar los parámetros más adelante.
→ **Fijado con la prueba 5: 50.000 iteraciones (P7).**

### D8. Frontend con el adaptador OpenNext para Cloudflare
`apps/web` se despliega con `@opennextjs/cloudflare` y Wrangler. La prueba 2 valida una página con SSR y un `fetch` con `credentials: 'include'` a la API. Si falla, el plan B es Vercel con el DNS en Cloudflare (sección 2.2 de la parte técnica).

### D9. Pruebas con Vitest
Vitest es más rápido y tiene soporte nativo de ESM. Para lo que depende del runtime (bindings, `scheduled`, Durable Object) se usa `@cloudflare/vitest-pool-workers`. Las pruebas de integración contra Postgres corren con el servicio de Docker o de CI; el Durable Object corre dentro del pool de Workers.
*Alternativa:* Jest, el estándar de NestJS. Se descarta porque no tiene pool para Workers. → **Pendiente de confirmar, P2.**

### D10. CI en un solo workflow con dos jobs
El job `verificar` corre en cada push y PR: pnpm install, lint, tests unitarios, tests de integración con el servicio `postgres` (el Durable Object corre dentro de `@cloudflare/vitest-pool-workers`, sin servicio aparte) y build. El job `desplegar` depende de `verificar` y solo corre en `main`: `prisma migrate deploy` con `NEON_DIRECT_URL`, `wrangler deploy` de la API y `wrangler deploy` del frontend. La CI no necesita Redis.

### D11. Esquema inicial con columnas decididas aquí
La parte técnica solo enumera tablas y contenido principal. Este cambio fija las columnas, los tipos, los enums de Postgres, las claves foráneas y estas restricciones:
- `citext` o índice único sobre `lower(correo)`.
- `CHECK (cantidad >= 0)` en stock.
- Unicidad en `stock.producto_id`, `sesiones.token_hash` y `ordenes.clave_idempotencia`.
- Índice sobre `reservas(estado, vence_en)`.

`carrito_items` admite un producto **o** una configuración (dos FKs que aceptan nulos y un `CHECK` de que haya exactamente una). Los sprints siguientes amplían el esquema con migraciones nuevas, no editando esta.

## Risks / Trade-offs

- [Bundle de NestJS + Prisma por encima del límite de tamaño del plan gratuito (la parte técnica indica 64 MiB sin comprimir; la documentación de Cloudflare también fija un límite comprimido menor, a reconfirmar)] → Medir en la prueba 1 con Prisma incluido, usar el cliente de Prisma sin motor Rust si la versión lo permite y, si no cabe, pasar a Hono (plan B ya previsto).
- [El arranque de NestJS consume la CPU de la primera petición de cada instancia] → Medir el arranque en frío por separado de la CPU estable y documentar los dos números.
- [La opción B concentra toda la carga en un solo Durable Object] → El script de 300 intentos mide el p95; esa es la entrada de la regla de decisión.
- [El caché de consultas de Hyperdrive, activo por defecto, devuelve stock o sesiones viejas] → Se crea con el caché desactivado, y la prueba 3 comprueba que una escritura se lee de inmediato.
- [Hyperdrive tiene sus propios límites en el plan gratuito (consultas por día, conexiones), aún sin confirmar] → Reconfirmarlos en la documentación durante la prueba 3 y anotarlos en el registro.
- [`pg` sobre Hyperdrive consume CPU o subrequests de forma distinta al driver de Neon] → Medirlo en la prueba 3. Si no conviene, se usa el plan B de D4.
- [La prueba de la cookie en Safari o Firefox necesita a una persona con el navegador] → Queda como tarea manual del desarrollador, con un procedimiento escrito.
- [Neon suspendido hace que `/health/ready` dé 503 falsos en CI] → Tiempo de espera de 3 s, configurable, y en CI se usa el Postgres local, no Neon.
- [Las pruebas repetidas consumen las filas escritas por día del Durable Object en producción] → Las 300 concurrentes se repiten en local con `wrangler dev`. Contra producción solo se hace una corrida, para medir latencia real.

## Migration Plan

No hay sistema previo. El orden de puesta en marcha es:
1. Prerrequisitos externos: dominio, cuentas, `wrangler login`, repositorio Git y GitHub.
2. Esqueleto local.
3. CI en verde.
4. Primer despliegue.
5. Pruebas de humo.
6. Decisiones registradas.
7. Limpieza de los endpoints temporales y del prototipo descartado.

Rollback: `wrangler rollback` a la versión anterior del Worker. La migración inicial no tiene versión anterior.

## Open Questions

Todas las decisiones de configuración ya están tomadas por el desarrollador (2026-11-10). P7 se fija con la medición de la prueba 5.

| # | Tema | Opciones | Decisión |
|---|---|---|---|
| P1 | Gestor de paquetes del monorepo | pnpm workspaces / npm workspaces / Turborepo | **Decidido: pnpm workspaces** |
| P2 | Framework de pruebas | Vitest (+ pool de Workers) / Jest | **Decidido: Vitest** |
| P3 | Dominio del frontend | `xdtech.store` / `app.xdtech.store` | **Decidido: `xdtech.store`** como principal, con `www` redirigido |
| P4 | Versión de Node.js en local y CI | 22 LTS / 24 | **Decidido: Node 24** (el instalado en local; se fija en `.nvmrc`, `engines` y la CI) |
| P5 | Acceso a Postgres desde el Worker | — | **Decidido: Hyperdrive + `adapter-pg`** (D4); en local, `localConnectionString` a Docker |
| P6 | Nombre de la rama principal y hosting del repo | `main` en GitHub, público o privado | **Decidido: `main`, repositorio público.** Como cualquiera puede leerlo, ninguna cadena, token ni contenido de `.dev.vars` puede llegar a un commit (tareas 1.1 y 6.4) |
| P7 | Costo del hash de contraseñas | Se decide con la medición de la prueba 5 | **Medido: PBKDF2-SHA256 con 50.000 iteraciones** (~6,5 ms de CPU de hash; Workers no admite más de 100.000). Ver docs/compatibilidad-cloudflare.md, prueba 5 |
| P8 | Hora de la limpieza diaria de sesiones | Cualquier hora UTC | **Decidido: 04:00 UTC** (23:00 en Perú) |

Decisiones que **el propio Sprint 0 resuelve con pruebas** (no hace falta responder ahora, pero bloquean el Sprint 1):
- Confirmación de la opción B del almacén (ya elegida por el desarrollador). Solo si no pasa las pruebas se evalúa A.
- Framework del backend: NestJS o Hono.
- Alojamiento del frontend: Cloudflare o Vercel.
- Alternativas para la cookie entre subdominios o para `CF-Connecting-IP`, si fallan.
