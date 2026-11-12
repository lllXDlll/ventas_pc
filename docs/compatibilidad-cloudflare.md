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
| 3 | Prisma con Neon por Hyperdrive | **OK** | Hyperdrive `xdtech-neon` con el caché desactivado (verificado con `wrangler hyperdrive get`). **Producción (2026-11-11):** con Neon suspendida (más de 6 min sin uso), la primera `/health/ready` tarda 877 ms de pared (incluye ~120 ms del Durable Object); con Neon despierta, 170–380 ms. **Escritura y lectura inmediata** (`POST /__prueba/escritura-lectura`: crea una fila con una conexión y la lee desde otra conexión nueva): leída de inmediato en 3 de 3 corridas y en otras 20 seguidas; escritura 152–991 ms y lectura 166–588 ms de pared; CPU p50 10,9 ms con tres conexiones (tres autenticaciones SCRAM). **Subrequests:** las conexiones por Hyperdrive no aparecen en la métrica `subrequests` del Worker (20 escritura-lectura, 60 conexiones: 0 subrequests). **Límites de Hyperdrive, plan gratuito** (documentación, consultada el 2026-11-11): **100.000 consultas por día**, leídas o escritas y con caché o sin ella (se reinicia a las 00:00 UTC; al superarlo, las consultas fallan); ~20 conexiones al origen por configuración; consultas de hasta 60 s; 15 s para conectar; 10 configuraciones por cuenta | **Neon por Hyperdrive con Prisma y `adapter-pg`, como estaba decidido.** No hace falta probar `@prisma/adapter-neon`. La cuota que hay que vigilar son las 100.000 consultas diarias de Hyperdrive: el cron de cada minuto (Sprint 3) debe hacer pocas consultas (1.440 ejecuciones por día). En las pruebas de Vitest dentro de workerd, `pg` no carga `pg-cloudflare` (falta la condición `workerd` en `require`), así que las pruebas con base de datos corren con `createTestHarness` de Wrangler |
| 4 | Almacén de disponibilidad (opción B, Durable Object) | **OK** | **Atomicidad:** 300 reservas concurrentes sobre 5 unidades dan exactamente 5 éxitos y disponible 0. Probado dentro de workerd (Vitest), por HTTP en local (3 de 3 corridas) y **en producción (2026-11-11 04:30 UTC): 5 exitosas, 295 `INSUFICIENTE`, disponible final 0.** Una reserva de varios productos es todo o nada, y `NO_INICIALIZADO` nunca se trata como 0. **Latencia en producción:** espera en el objeto p50 132 ms, p95 383 ms; latencia del cliente desde Perú con 300 conexiones simultáneas p50 0,93 s, p95 1,08 s y máx. 1,31 s (las 300 en 1,34 s). En local, la espera en el objeto fue p50 40–68 ms y p95 99–112 ms. **Filas escritas:** 4 por reserva de un producto y 2 + 2·N para N productos (tablas `WITHOUT ROWID`). Con 100.000 filas por día, eso da ~25.000 reservas de un producto por día. **Subrequests:** 1 por reserva (ver la prueba 9) | Ver "Confirmación de la opción B" más abajo. **Hallazgo:** en `api.xdtech.store`, las 300 peticiones simultáneas desde una sola IP reciben **429 del borde de Cloudflare** ("Access denied … used Cloudflare to restrict access"), antes de llegar al Worker. La corrida de producción se hizo por `xdtech-api.jorsh123gg.workers.dev`, que es el mismo Worker y el mismo Durable Object pero no pasa por las reglas de la zona. Con usuarios reales, cada uno desde su IP, esto no ocurre. Afecta al escenario k6 del Sprint 3 si se lanza desde una sola máquina |
| 5 | Hash de contraseñas (PBKDF2, Web Crypto) | **OK** | `GET /__prueba/pbkdf2` en producción (2026-11-11). CPU total de la petición según `wrangler tail` (6 muestras por valor; la primera de cada isolate sale más alta): 1.000 iteraciones 2–16 ms (mediana 3, base de la petición); 10.000 → 3–12 (3); 25.000 → 4–23 (5,5); **50.000 → 8–16 (9,5)**; 75.000 → 11–21 (12); 100.000 → 15–28 (16). **Por encima de 100.000, Workers lo rechaza:** `NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported`. Costo del hash: ~0,13 ms de CPU por cada 1.000 iteraciones (~6,5 ms con 50.000) | **PBKDF2-SHA256 con 50.000 iteraciones** (P7): es el mayor valor probado que deja el hash por debajo de ~8 ms (~6,5 ms) y la petición en ~10 ms. Formato `pbkdf2$50000$<sal>$<hash>`, que permite subir las iteraciones más adelante. **A tener en cuenta:** está por debajo de lo que recomienda OWASP para PBKDF2-SHA256 (600.000), un valor que Workers no permite. El tope del runtime es 100.000 (~13 ms de hash). Subir a 100.000 es decisión del desarrollador, a costa de pasar los 10 ms de CPU en cada inicio de sesión. No hace falta argon2id en WASM |
| 6 | Cookie entre subdominios | **OK** | La API (`POST /__prueba/cookie`) emite `xd_prueba=…; Max-Age=600; Domain=.xdtech.store; Path=/; HttpOnly; Secure; SameSite=Lax`. Desde `https://xdtech.store/pruebas/cookie`, con `credentials: 'include'`, el valor que recibe `api.xdtech.store` coincide con el emitido en **Chrome 157**, **Brave** (Chromium) y **Firefox 160**, todos en Windows (2026-11-11) | Sesión con cookie `httpOnly; Secure; SameSite=Lax; Domain=.xdtech.store` emitida por la API, como estaba previsto. No hace falta una alternativa de sesión |
| 7 | IP real (`CF-Connecting-IP`) | **OK** | Desde `api.xdtech.store` y desde `*.workers.dev` (2026-11-11), `CF-Connecting-IP` devuelve la IP pública del cliente (IPv6). `X-Forwarded-For` llega vacío. **La IP del socket que expone `httpServerHandler` coincide con `CF-Connecting-IP`**, al contrario de lo que se suponía | Usar `CF-Connecting-IP` de forma explícita en el límite de peticiones del Sprint 1, porque es la cabecera documentada y Cloudflare la reescribe en el borde. Como llegan direcciones IPv6, agrupar los intentos por prefijo /64 |
| 8 | Cron Trigger | **OK** | En local, `wrangler dev --test-scheduled` y `/__scheduled?cron=...` ejecutan `expirar`, `reconciliar` y `limpiarSesiones`, y un cron desconocido solo registra una advertencia. En producción (`wrangler tail`, 2026-11-11 02:20 UTC): `* * * * *` ejecuta `expirar` y `*/5 * * * *` ejecuta `reconciliar`, ambos con resultado Ok | Se mantienen los tres crons de D3 |
| 9 | Subrequests por reserva | **OK** | Métrica `subrequests` de las analíticas del Worker (GraphQL `workersInvocationsAdaptive`), en minutos con un solo tipo de tráfico (2026-11-11): **20 reservas de ejemplo (llamada al Durable Object + escritura en Postgres por Hyperdrive) = 22 subrequests**, es decir, 1 por reserva más 2 de la inicialización del objeto la primera vez. 20 `/health/ready` = 20 (1 por llamada al Durable Object). 20 escritura-lectura con 3 conexiones cada una = 0. Prueba de 300: 286 subrequests en 285 invocaciones. CPU p50 de la reserva de ejemplo: 8,4 ms | **1 subrequest por reserva, muy por debajo de 50.** La llamada al Durable Object cuenta como subrequest. Las conexiones por Hyperdrive no aparecen en la métrica, aunque sí cuentan para el límite de 6 conexiones simultáneas por petición (documentación de Workers) |

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

### Confirmación de la opción B (tarea 7.7, 2026-11-11)

Regla de la sección 5.3 de la parte técnica, aplicada a la opción B (la A, Upstash, solo se prueba si la B falla):

| Criterio | Resultado | ¿Pasa? |
|---|---|---|
| Atomicidad | 300 reservas concurrentes sobre 5 unidades: exactamente 5 reservas y disponible 0, en local y en producción. Reserva de varios productos todo o nada | Sí |
| Funcionamiento en Workers | Durable Object `Inventario` con SQLite, declarado en `wrangler.jsonc` con `new_sqlite_classes`, desplegado y en uso desde `/health/ready` | Sí |
| Consumo | 4 filas escritas por reserva de un producto. Con el límite de 100.000 filas por día del plan gratuito, caben ~25.000 reservas diarias. Las pruebas y la demo usan unos cientos o miles (una corrida de 300 escribe 20 filas, porque solo las 5 exitosas escriben). Queda muy por debajo de la mitad de la cuota. 1 subrequest por reserva | Sí |
| Latencia | Producción, con 300 reservas simultáneas: espera en el objeto p50 132 ms y p95 383 ms; latencia del cliente desde Perú p50 0,93 s y p95 1,08 s. Una reserva aislada tarda lo que una llamada al objeto (~115 ms de pared en `/health/ready`) | Sí: aceptable para un flujo de compra |

**Decisión: se confirma la opción B.** No se prototipa Upstash. Motivo: pasa los cuatro criterios con margen, no suma una pieza externa ni otra cuenta, y el desarrollador ya la había elegido. Las referencias a Upstash de la parte técnica, la arquitectura y los Sprints 0, 1, 3, 6 y 7 se actualizaron en la tarea 8.2.

## Mediciones del Sprint 1 (tarea 6.2, 2026-11-11)

CPU por petición en producción (`wrangler tail`), medida con tres cuentas de prueba (`medicion-cpu-…@xdtech.test`). Hubo dos pasadas: la primera justo después de un despliegue, con instancias frías, y la segunda en caliente.

| Ruta | En caliente: mediana (rango) | Con instancias frías | Trabajo por petición |
|---|---|---|---|
| `GET /health/live` | 2 ms (1–3) | 11–18 ms | ninguno (referencia) |
| `GET /auth/me` | 7 ms (5–14) | hasta 67 ms | 1 consulta (sesión + usuario) |
| `GET /productos` | 15 ms (8–35) | hasta 155 ms | 2 consultas (listado + total) |
| `POST /auth/login` fallido | 25 ms (16–32) | hasta 169 ms | PBKDF2 (hash ficticio si no hay cuenta) + 2 llamadas a `Limites` + 1 consulta |
| `POST /auth/login` correcto | 32 ms (19–83) | hasta 111 ms | PBKDF2 + 3 llamadas a `Limites` + 3 consultas |
| `POST /auth/registro` | — | 29–136 ms | PBKDF2 + 1 llamada a `Limites` + 1 escritura |
| `POST /auth/logout` | — | 26 ms | 2 consultas |

- **Conexiones:** cada petición abre como mucho una conexión a Postgres (verificado con `pg_stat_database` en las pruebas de integración). Las 3 consultas de un inicio de sesión comparten la misma.
- **PBKDF2 pesa poco en el total:** con 50.000 iteraciones son ~6,5 ms (prueba 5) de los ~32 ms de un inicio de sesión. El resto es la conexión con su autenticación SCRAM (~4 ms), las consultas de Prisma y las llamadas a `Limites`. Bajar las iteraciones no deja el inicio de sesión por debajo de 10 ms; subirlas a 100.000 sumaría ~6,5 ms.
- **Decisión del desarrollador (2026-11-11): se mantienen 50.000 iteraciones.** Cambiarlas no resuelve el costo del inicio de sesión, que está en otras partes. Se revisa con la carga del Sprint 3.
- **Las rutas con consultas superan los 10 ms de CPU del plan gratuito.** En el Sprint 0 y en estas mediciones, ninguna petición fue cortada por CPU: el plan gratuito no corta al primer exceso. Si en la carga del Sprint 3 aparecen errores `Exceeded CPU`, las opciones son el plan de pago de Workers ($5 al mes, 30 s de CPU por petición) o reducir el trabajo por petición.
- **Limpieza:** las cuentas de prueba se borran con `DELETE FROM usuarios WHERE correo LIKE 'medicion-cpu-%@xdtech.test';`. Sus sesiones se borran en cascada.
- **Regla de límite de la zona:** la regla de rate limiting de `xdtech.store` bloqueaba la navegación normal con el error 1015: las pruebas `@humo` de Playwright la activaron en segundos. El desarrollador la eliminó el 2026-11-11. Los límites de registro e inicio de sesión los aplica la API con el Durable Object `Limites`.

## Prueba de R2 (Sprint 1.5, tarea 0.2, 2026-11-11)

**Resultado: OK. Se usa R2 para las imágenes de producto.**

La prueba usó un Worker temporal (`xdtech-prueba-r2`, en `workers.dev`, protegido por un token aleatorio) con el binding `IMAGENES` sobre el bucket de producción `xdtech-imagenes`, en la misma cuenta que la API. Al terminar se borraron el Worker y los objetos. Se usó un Worker aparte para no desplegar código sin revisar en `api.xdtech.store`.

| Operación (objeto de 2 MB con cabecera PNG) | Resultado | CPU (`wrangler tail`), mediana (rango) | Tiempo de pared |
|---|---|---|---|
| Escritura (`put` del cuerpo completo leído con `arrayBuffer()`) | 6 de 6 OK | 5 ms (2–7) | 565–1.782 ms (la primera, en frío) |
| Lectura (`get` con stream del cuerpo) | idéntica byte a byte, con `Content-Type` y `ETag` | 0 ms | — |
| Borrado (`delete` y `head` posterior) | 6 de 6 borrados; la lectura posterior da 404 | 1 ms (0–2) | — |

- **Coste de la subida:** la subida de 2 MB suma ~5 ms de CPU a lo que ya cuesta NestJS. Se espera una subida completa de ~15 ms, en el orden de `GET /productos`. Es una operación esporádica del administrador.
- **Lectura:** en stream no consume CPU apreciable, así que servir la imagen desde la API (design D9) es viable.
- **Plan B (no aplicado):** sin R2, no habría imágenes. Los productos mostrarían el icono de su categoría y las imágenes no se guardarían en Postgres.

## Mediciones del Sprint 1.5 (tarea 2.5, 2026-11-11)

CPU por petición en producción (`wrangler tail`), justo después del despliegue del Sprint 1.5. Se hicieron 8 rondas de 5 peticiones: listado sin filtros, por categoría con socket y orden, por texto con dos marcas, facetas globales y facetas por categoría.

| Ruta | Mediana (rango) | Trabajo por petición |
|---|---|---|
| `GET /productos` (con y sin filtros) | 14 ms (9–50) | 2 consultas (listado + total); los filtros nuevos van en la misma consulta |
| `GET /facetas` | 12 ms (6–36; 174 en la primera, en frío) | 3 consultas en una conexión (marcas, sockets con `$queryRaw`, rango de precio) |

- Los filtros por marca, socket, texto y orden no suben la CPU del listado. En el Sprint 1 la mediana era de 15 ms.
- Las facetas cuestan lo mismo que el listado. El frontend las guarda 5 minutos en caché (`staleTime`), así que no se piden en cada navegación.

## Lighthouse móvil en `/catalogo` (tarea 10.4, 2026-11-11)

**Resultado: accesibilidad 100 (objetivo ≥ 90, OK); rendimiento 71–79 en 6 corridas (objetivo ≥ 80, NO OK).**

| Corrida | Rendimiento | Accesibilidad | TTFB del documento | LCP | Cambio desplegado |
|---|---|---|---|---|---|
| 1–3 | 75, 79, 77 | 100 | 840–900 ms | 4,2–4,4 s | despliegue inicial del Sprint 1.5 |
| 4–6 | 71, 74, 76 | 100 | 1.170–2.640 ms | 4,4–5,9 s | Smart Placement + `relationJoins` |

**Causa.**
- El CLS es 0 y el TBT es de 220–280 ms. El LCP es el nombre de un producto, que ya llega en el HTML.
- Lo que pesa es la latencia hasta Neon. La base está en AWS `us-east-2` (Ohio) y los Workers corren en São Paulo (`Cf-Placement: local-GRU`), así que cada consulta suma unos 150 ms de ida y vuelta.
- Mediana de 5 a 9 peticiones desde Lima:

| Ruta | Consultas a Neon | TTFB |
|---|---|---|
| `/health/live` | 0 | 0,47 s |
| `/categorias` | 1 | 0,62 s |
| `/productos` | varias | 1,12 s |

**Correcciones aplicadas.**
- **Smart Placement en el Worker de la API.** Tras 25 minutos de tráfico ligero, Cloudflare mantuvo el Worker en GRU. Sin efecto.
- **`relationJoins` de Prisma.** La categoría y el stock se cargan con un JOIN en la misma consulta:
  - `/productos` pasa de 1,12 s a 0,80 s;
  - `/productos/:id` pasa de 0,98 s a 0,64 s.

  El TTFB del documento sigue variando de 1,2 a 2,6 s por el render de OpenNext más las llamadas a la API.

**Pendiente (decisión del desarrollador).**
- **Mover Neon a una región cercana a los visitantes** (AWS `sa-east-1`, São Paulo). Es la corrección de fondo: bajaría cada viaje de ~150 ms a unos pocos milisegundos. Exige crear el proyecto en esa región, migrar los datos y actualizar Hyperdrive y el secreto `NEON_DIRECT_URL`.
- **Una caché corta en el borde** para el catálogo público **no se aplica**: contradice el requisito "los cambios se ven en la siguiente consulta" (spec `catalogo`).

## Mediciones del Sprint 2 (tarea 3.3, 2026-11-11)

CPU por petición en producción (`wrangler tail`), justo después del despliegue del Sprint 2. Se usaron 10 peticiones por ruta, con una configuración de 5 productos (procesador, placa, RAM, fuente y gabinete) de una cuenta de prueba (`medicion-cpu-s2-…@xdtech.test`).

| Ruta | Mediana (rango) | Trabajo por petición |
|---|---|---|
| `POST /compatibilidad/validar` | 12 ms (6–134; los valores altos son las primeras peticiones, en frío) | 2 consultas (productos y reglas) y el motor puro |
| `GET /configuraciones/:id` | 21 ms (7–74) | sesión, configuración con sus ítems, productos y reglas (4 consultas), y el motor |

- **Validar cuesta lo mismo que listar el catálogo** (14 ms de mediana en el Sprint 1.5). El armador valida con 300 ms de antirrebote y caché por combinación de productos, así que no se valida en cada clic.
- **Limpieza:** `DELETE FROM usuarios WHERE correo LIKE 'medicion-cpu-%@xdtech.test';` borra la cuenta, y sus configuraciones se borran en cascada.
