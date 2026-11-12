# Parte técnica: especificaciones y reglas de construcción

> Léelo completo antes de cualquier sprint. Es el contexto fijo del proyecto. Las historias de usuario están en `sprint_0X.md`; cada sprint se implementa en orden y solo se lee el del sprint actual.

## 1. Descripción del proyecto

Plataforma web de venta de computadoras y componentes. El cliente arma su PC manualmente o con un asistente de IA que recomienda según presupuesto y uso. Toda configuración se valida con un motor de reglas de compatibilidad. El punto crítico es la **concurrencia**: 300 usuarios simultáneos compitiendo por un componente de stock limitado sin sobreventa.

Fuera de alcance: pasarelas de pago reales, logística de envío, garantías y servicio técnico, marketplace multivendedor, comparación con otras tiendas, diagnóstico de hardware con IA, chatbot de soporte general, reconocimiento de imágenes. Diferido a una mejora futura: la recuperación de contraseña por correo (ver sección 10).

## 2. Stack y despliegue

**El despliegue se realiza en Cloudflare, con el CLI Wrangler.** La base de datos es **Neon**, a la que el Worker accede por **Cloudflare Hyperdrive**. El almacén de disponibilidad es un **Durable Object con SQLite** (opción B, confirmada en el Sprint 0; ver sección 5.3). Los resultados y las mediciones del Sprint 0 están en `docs/compatibilidad-cloudflare.md`.

| Pieza | Tecnología / servicio | Estado |
|---|---|---|
| Frontend | Next.js en Cloudflare con `@opennextjs/cloudflare` y Wrangler; Tailwind CSS v4, componentes estilo shadcn/ui (Radix), TanStack Query, react-hook-form y zod (Sprint 1.5) | **Validado en el Sprint 0** (prueba 2). Se compila y despliega desde Linux (CI): en Windows el build de OpenNext falla |
| Imágenes de producto | Cloudflare R2 (bucket `xdtech-imagenes`, binding `IMAGENES`), servidas por la API con caché inmutable | **Validado en el Sprint 1.5** (escritura, lectura y borrado de 2 MB desde un Worker) |
| Backend | NestJS (TypeScript, adaptador Express) sobre Cloudflare Workers | **Validado en el Sprint 0** (prueba 1), con NestJS y Prisma inicializados en el ámbito global del Worker |
| Base de datos | PostgreSQL en Neon + Prisma 7 con `@prisma/adapter-pg`, por Cloudflare Hyperdrive (caché de consultas desactivado) | **Fijada y validada** (prueba 3) |
| Caché / concurrencia | Durable Object `Inventario` con SQLite en Cloudflare (opción B). Upstash queda solo como respaldo no implementado | **Decidido en el Sprint 0** (prueba 4) |
| IA | API de un LLM (Claude) tras un adaptador intercambiable | Fijada |
| Herramientas | Node.js 24 en local y en la CI (`.nvmrc`, `engines`), pnpm workspaces, Vitest, TypeScript estricto | Fijadas en el Sprint 0 |

### 2.0 Principio de validación de compatibilidad

Cloudflare es la plataforma, pero **ningún supuesto de compatibilidad se da por cierto hasta que una prueba lo confirme**. En el Sprint 0 el agente ejecuta las pruebas de humo (HU-36b) con Wrangler y registra cada resultado en `docs/compatibilidad-cloudflare.md`, con una tabla: prueba, resultado (OK o no OK), medidas y decisión tomada. Ningún sprint posterior se construye sobre algo que no tenga resultado OK o una decisión documentada de plan B. Ese archivo es también insumo del informe final.

### 2.0.1 Cómo corre NestJS en Workers

- Los Workers no ejecutan un servidor Node tradicional. Se usa `node:http` con `httpServerHandler` de `cloudflare:node`: NestJS se inicializa una vez por instancia del Worker y sus peticiones se enrutan al servidor HTTP. El puerto que se pasa a `listen()` es solo una clave de enrutamiento, no un puerto de red.
- NestJS y el cliente de Prisma se inicializan en el **ámbito global del módulo** (`await` de nivel superior en `src/worker.ts`), sin E/S. Así esa CPU cuenta como arranque de la instancia y no como CPU de la primera petición (Sprint 0, prueba 1: la primera petición bajó de 32–128 ms a 10–18 ms de CPU).
- Prisma usa **un `PrismaClient` por instancia y una sola conexión `pg` por petición HTTP**. El `fetch` del Worker ejecuta cada petición dentro de `enPeticion()`, que guarda una conexión perezosa en `AsyncLocalStorage`. Todas las llamadas a `conPrisma()` de esa petición la comparten, y se cierra con `waitUntil` al responder. Fuera de una petición (cron, scripts), `conPrisma()` abre y cierra su propia conexión. Motivo: cada conexión nueva cuesta ~4 ms de CPU por la autenticación SCRAM, y crear un cliente por petición costaba de 14 a 24 ms. Dentro de una transacción interactiva no se lanzan consultas en paralelo, porque comparten conexión.
- `workerd` cierra los sockets de una petición al terminar la invocación, aunque la API no los cierre: ninguna conexión sobrevive a su petición (comprobado en el Sprint 1).
- Con fecha de compatibilidad `2026-08-04` o posterior no hace falta ningún flag de Node.js (`nodejs_compat` viene activado). Con fechas anteriores habría que agregarlo.
- Soportado: `http`, `https`, `crypto`, `buffer`, `stream`, `events`, `url`, `path`, `process`, `util`, `zlib`, Web Crypto. `net` solo para conexiones TCP salientes (`net.Server` no existe). `child_process`, `worker_threads`, `cluster`, `vm` y similares son stubs que no funcionan.
- No hay eventos `upgrade` (sin WebSockets), ni trailers, ni acceso real al socket. La IP del cliente se lee de `CF-Connecting-IP` (ver 2.2). En el Sprint 0, `req.socket.remoteAddress` devolvió el mismo valor, pero no es un comportamiento documentado y no se usa.
- Cada petición puede ejecutarse en una instancia distinta y efímera del Worker: **no se guarda estado en memoria entre peticiones**.
- La documentación no nombra a NestJS, Express ni Fastify. Que funcionen es una hipótesis que se valida en el Sprint 0.

### 2.1 Notas operativas y límites

- **Workers, plan gratuito** (documentación de Cloudflare; reconfirmar antes de la demo): 100.000 peticiones al día (se reinicia a las 00:00 UTC), 10 ms de CPU por petición (la espera de red no cuenta, el hash de contraseñas sí), 50 subrequests por petición (cada `fetch` y cada llamada a un Durable Object cuentan; una reserva usa 1, medido en el Sprint 0), 128 MB de memoria, 5 Cron Triggers por cuenta, 64 MiB de tamaño del Worker sin comprimir.
- **Durable Objects, plan gratuito** (solo con almacenamiento SQLite): 100.000 peticiones al día, 13.000 GB-s de duración al día, 5 millones de filas leídas al día, 100.000 filas escritas al día y 5 GB almacenados. Una reserva de un producto escribe 4 filas (~25.000 reservas por día).
- **Neon:** 100 CU-hours por proyecto al mes; el cómputo se suspende tras 5 min sin actividad y eso no se puede cambiar. La primera petición tras un rato sin tráfico despierta la base de datos; configurar un tiempo de espera de conexión razonable. La cadena directa de Neon se usa para Hyperdrive y para las migraciones (`DIRECT_URL`); el Worker no tiene ninguna cadena de conexión.
- **Hyperdrive, plan gratuito:** 100.000 consultas al día (leídas o escritas; se reinicia a las 00:00 UTC y, al superarlo, las consultas fallan), ~20 conexiones al origen por configuración y consultas de hasta 60 s. El caché de consultas está **desactivado**, para que el stock y las sesiones se lean siempre actuales.
- **Endpoints de salud:** `GET /health/live` (sin dependencias, responde 200) y `GET /health/ready` (verifica Postgres y el almacén de disponibilidad; 503 si alguno falla; solo para CI y uso manual). En Workers no hay arranque en frío de un servicio dormido, por lo que **no se necesita monitor externo**.
- Docker queda para desarrollo local, pruebas de integración y pruebas de carga. El backend se ejecuta en local con `wrangler dev`.
- El proyecto no envía correos: las notificaciones son dentro de la aplicación. No hay proveedor de correo ni configuración SPF/DKIM.
- Costo: todo usa planes gratuitos **excepto el dominio `xdtech.store`**, que tiene costo de compra y de renovación anual. Debe estar comprado y con su DNS administrado en Cloudflare **antes de empezar el Sprint 0**.

### 2.2 Dominio, sesión y límites de peticiones (decisiones fijadas)

**Dominio y DNS.** Dominio propio `xdtech.store` con DNS en Cloudflare.
- API: `api.xdtech.store`, configurado como **Custom Domain del Worker** (Cloudflare gestiona el registro y el certificado; validar en el Sprint 0).
- Frontend: `xdtech.store`, también como Custom Domain en Cloudflare; `www.xdtech.store` redirige con 308 al dominio principal.
- Ambos subdominios son del mismo sitio para el navegador: no hay proxy desde Next.js ni cookies de terceros.

**Sesión.** Cookie de sesión con identificador opaco; la sesión se guarda en Postgres (tabla `sesiones`).
- Cookie `xd_sesion`: `HttpOnly; Secure; SameSite=Lax; Domain=.xdtech.store; Path=/` y `Max-Age` de `SESSION_TTL_DAYS` días. En desarrollo local va sin `Domain` ni `Secure` (`COOKIE_DOMAIN` vacío).
- Contraseñas: PBKDF2-SHA256 con 50.000 iteraciones y sal propia, guardadas como `pbkdf2$<iteraciones>$<sal>$<hash>`. Si el correo no existe, se calcula un hash ficticio, para que el tiempo de respuesta no revele qué cuentas existen.
- El valor de la cookie es un token aleatorio de 256 bits; en la base de datos solo se guarda su SHA-256 (`token_hash`).
- Vencimiento: 7 días (variable de entorno). Cerrar sesión marca la sesión como revocada y guarda `revocada_en`.
- Limpieza: un **Cron Trigger diario** borra las sesiones vencidas y las revocadas con más de un día; además, al iniciar sesión se borran las vencidas o revocadas de ese usuario. Una sesión vencida o revocada siempre se rechaza, se haya borrado o no.
- CORS: la API permite credenciales únicamente desde el origen del frontend (variable de entorno), nunca con comodín.
- Se descarta JWT: no permite invalidar la sesión al cerrar sesión sin una lista de bloqueo adicional.

**Límites de peticiones (rate limiting).**
- **Registro:** límite por IP. Limitar por correo no protege, porque quien abusa cambia de correo en cada intento.
- **Inicio de sesión:** límite por correo (cuenta solo los intentos **fallidos** y se borra al acertar) y, además, un límite por IP más holgado.
- **Asistente de IA:** límite por usuario autenticado, contado a partir de las filas de `uso_asistente` de las últimas 24 horas (dato durable en Postgres).
- **IP real del cliente:** se lee del encabezado `CF-Connecting-IP` que agrega Cloudflare (validado en el Sprint 0). **No usar `req.ip`, `req.socket.remoteAddress` ni `trust proxy`**: en Workers el socket es simulado. Llegan direcciones IPv6: los límites por IP agrupan los intentos por prefijo /64.
- **Dónde viven los contadores de registro e inicio de sesión:** en el Durable Object `Limites` (binding `LIMITES`, declarado en el Sprint 0), separado de `Inventario` para no sumar carga al objeto de reservas. **Nunca en memoria del Worker** (cada petición puede caer en otra instancia) **ni en KV** (es eventualmente consistente y no sirve para contadores).
- Los valores concretos son configurables por variables de entorno (ver sección 7).

## 3. Estructura del repositorio

```
repo/
  apps/
    web/                 Next.js (frontend), por capas (Sprint 1.5):
      src/app/           rutas: solo componen páginas ((tienda), (auth), admin, dev/ui)
      src/features/      catalogo, auth, admin: api.ts, hooks/, contenedores/ y components/
      src/components/    ui/ (átomos y moléculas) y layout/ (shell de la tienda y del panel)
      src/lib/           cliente HTTP, formatos, atributos, tipos
      src/styles/        tokens.css (único archivo con colores) y globals.css
    api/                 NestJS (backend)
      wrangler.jsonc     configuración de Wrangler (sin secretos)
      src/
        worker.ts        entrada del Worker: inicia NestJS, exporta fetch (httpServerHandler) y scheduled
        auth/            registro, sesión, roles
        catalogo/        productos, atributos técnicos, stock
        compatibilidad/  motor de reglas
        asistente/       adaptador de IA y respaldo determinístico
        carrito/
        reservas/        almacén de disponibilidad (Durable Object Inventario) y reconciliación
        pagos/           pago simulado y comprobantes
        notificaciones/
        historial/
        admin/           gestión y reportes
        health/          endpoints de salud
      prisma/            esquema y migraciones
  docs/
    compatibilidad-cloudflare.md   resultados de las pruebas de humo del Sprint 0
  tests/
    k6/                  escenarios de carga
  docker-compose.yml     Postgres local (los Durable Objects corren en `wrangler dev`)
  .github/workflows/     integración continua y despliegue con Wrangler
```

## 4. Modelo de datos (Prisma)

| Tabla | Contenido principal |
|---|---|
| usuarios | correo, hash de contraseña, rol (CLIENTE / ADMIN), estado |
| sesiones | hash del token de sesión, usuario, vencimiento, revocada, fecha de revocación (`revocada_en`), fecha de creación |
| categorias | procesador, placa madre, RAM, tarjeta gráfica, fuente, gabinete, almacenamiento, equipo armado |
| productos | nombre, marca, tipo (COMPONENTE / EQUIPO), precio, activo, atributos técnicos en JSONB, clave de la imagen en R2 (`imagen_clave`, opcional; la imagen no se guarda en Postgres) |
| stock | producto, cantidad física, versión (bloqueo optimista) |
| reglas_compatibilidad | código de regla (`SOCKET`, `RAM`, `POTENCIA`, `DIMENSIONES`, `FACTOR_FORMA`, `ALMACENAMIENTO`), parámetros JSONB, activa |
| configuraciones | usuario, origen (MANUAL / IA), presupuesto, uso, estado |
| configuracion_items | configuración, producto, cantidad |
| carritos / carrito_items | carrito del usuario con productos o configuraciones |
| reservas / reserva_items | usuario, estado (ACTIVA / CONFIRMADA / EXPIRADA), vencimiento, productos y cantidades |
| ordenes / orden_items | compra confirmada, clave de idempotencia única, total |
| comprobantes | número, orden, fecha, detalle |
| notificaciones | usuario, tipo, mensaje, leída |
| uso_asistente | usuario, presupuesto, uso, resultado, latencia, si se usó respaldo |

Atributos técnicos obligatorios en JSONB, por categoría (fijados en el Sprint 1; la API los valida al crear o editar un producto y admite atributos adicionales):

| Categoría | Atributos obligatorios |
|---|---|
| PROCESADOR | `socket` (texto), `potenciaConsumidaW` (entero); opcional: `altoDisipadorMm` (entero, disipador incluido; Sprint 2) |
| PLACA_MADRE | `socket`, `tipoRam`, `factorForma` (texto), `velocidadRamMaxMhz` (entero, Sprint 2), `maxModulosRam` (entero), `interfacesAlmacenamiento` (lista) |
| RAM | `tipoRam` (texto), `velocidadRam`, `modulos` (entero) |
| TARJETA_GRAFICA | `potenciaConsumidaW`, `largoMm` (entero) |
| FUENTE | `potenciaEntregadaW` (entero) |
| GABINETE | `factoresFormaSoportados` (lista), `largoGpuMaxMm`, `altoDisipadorMaxMm` (entero) |
| ALMACENAMIENTO | `interfaz` (texto) |
| EQUIPO_ARMADO | ninguno (descripción libre) |

Los enteros son positivos y las listas, de textos no vacíos. Las medidas llevan la unidad en el nombre (`largoMm`) en lugar de un objeto `dimensiones`. El motor de reglas del Sprint 2 usa estos nombres.

Un equipo armado se registra como producto propio con su propio stock.

## 5. Reglas de concurrencia (no negociables)

El **almacén de disponibilidad** es el Durable Object `Inventario` (sección 5.2), elegido en el Sprint 0. Todo el código accede a él a través del puerto `DisponibleService`, de modo que cambiar de almacén solo cambiaría su implementación.

1. **Postgres guarda la verdad**: stock físico y compras confirmadas.
2. **El almacén de disponibilidad guarda el disponible para vender** = stock físico − reservas activas.
3. Ninguna venta se confirma sin una transacción en Postgres.
4. **Reservar**: una única operación atómica verifica que todos los productos tengan disponible suficiente; si es así, descuenta todos, crea la reserva con vencimiento y la registra. Si falta alguno, no descuenta nada y devuelve cuál faltó. Si el disponible de un producto **no existe** en el almacén, la operación devuelve "no inicializado" (nunca lo trata como cero) y la API lo reconstruye desde Postgres y reintenta.
5. **Registrar**: la API guarda la reserva en Postgres con estado ACTIVA (respaldo auditable).
6. **Confirmar**: con `Idempotency-Key`, una transacción Postgres descuenta el stock físico con actualización condicional (`cantidad >= n AND version = v`), crea la orden, el comprobante con su número correlativo y la notificación de compra, marca la reserva CONFIRMADA y vacía el carrito. Después cierra la reserva en el almacén **sin devolver stock**. Desde el Sprint 4 la invoca `POST /pagos/confirmar` solo cuando el pago simulado aprueba.
7. **Expirar**: una operación atómica devuelve al disponible las cantidades de las reservas vencidas y las elimina. Se ejecuta con un **Cron Trigger cada minuto** y **antes de cada intento de reserva**. La reserva en Postgres pasa a EXPIRADA.
8. **Reconciliar**: un Cron Trigger periódico (por ejemplo cada 5 minutos) recalcula el disponible como stock físico − reservas ACTIVAS y corrige el almacén. Además, la reconstrucción es **perezosa por producto**: si el disponible de un producto no existe, se recalcula desde Postgres sin sobrescribir uno existente. No se depende de un "arranque de la API", porque en Workers ocurre en cada instancia.
9. **Idempotencia**: cada confirmación exige el encabezado `Idempotency-Key`; una restricción de unicidad en `ordenes` hace que un reintento devuelva la orden original.
10. La IA **nunca** participa en concurrencia ni en cobro.

### 5.1 Opción A: Redis en Upstash con Lua (respaldo, no implementada)

Se conserva como referencia por si la opción B dejara de servir. No se implementó, porque la B pasó las pruebas del Sprint 0.

- Estructuras: contador de disponible por producto (`disp:{productoId}`), registro por reserva con TTL (`reserva:{id}`), índice ordenado por vencimiento (`reservas:vencimientos`).
- La reserva y la expiración son scripts Lua (`reservar.lua`, `expirar.lua`) ejecutados con `eval`/`evalsha`; Redis los procesa de forma indivisible.
- Cliente HTTP `@upstash/redis` (no `ioredis`). Cada llamada cuenta como un subrequest; el script Lua cuenta como una.
- La reconstrucción perezosa usa `SET ... NX`.

### 5.2 Opción B: Durable Object con SQLite (elegida)

- Un único Durable Object `Inventario` para todo el catálogo, de modo que la reserva de varios productos sea atómica (un Durable Object procesa sus peticiones una por una). Cada reserva pasa por ese único objeto: es el posible cuello de botella a medir en el Sprint 0.
- Almacenamiento SQLite del objeto: `disponible(producto_id, cantidad)`, `reservas(id, vence_en)` y `reserva_items(reserva_id, producto_id, cantidad)`.
- Métodos: `reservar(items, vencimiento)`, `expirar()`, `cerrar(reservaId)`, `reconstruir(productoId, cantidad)` y `consultar(productoId)`. La expiración la invocan el Cron Trigger y cada `reservar`.
- Métodos del Sprint 3: `consultarVarios(ids)` (catálogo, 1 subrequest por página), `reconstruirVarios(items)` (reconstrucción perezosa en lote, sin sobrescribir), `liberar(reservaId)` (cancelar, reemplazar la reserva del cliente o compensar un fallo de Postgres), `reconciliar(fisicos)` y `ajustar(productoId, delta)` (cambio de stock desde el panel).
- **La reconciliación cuenta las reservas dentro del objeto, no desde Postgres:** disponible = físico − reservas vigentes del propio objeto. Así una reserva hecha en el objeto y aún no registrada en Postgres (en vuelo) no se pisa.
- **Margen de confirmación:** una reserva que vence en menos de 30 s ya no se confirma. Así el objeto nunca devuelve al disponible algo que Postgres está vendiendo. El `UPDATE` condicional (`cantidad >= n AND version = v`) impide igualmente que el stock físico quede negativo.
- Una reserva activa por cliente: reservar de nuevo libera la anterior. El pago (`POST /pagos/confirmar`, Sprint 4) llama a `ConfirmacionService` dentro de Nest; el RPC `confirmar` del Worker (sin ruta HTTP) queda para uso interno.
- **Prisma y concurrencia:** no se usa `findUnique` en la API. Prisma agrupa los `findUnique` simultáneos en una sola consulta y, con un `PrismaClient` por isolate, juntaba peticiones distintas sobre la conexión de una sola; workerd cancelaba las demás ("code had hung"). Se usa `findFirst`, y una regla de ESLint lo impide.
- **Prisma y transacciones interactivas (Sprint 4):** Prisma también agrupa las consultas de una transacción interactiva (`batchBy: itx-<id>`) y las despacha en un `process.nextTick` compartido por el cliente. Con el cliente del isolate, la transacción de una petición se ejecutaba en el contexto de otra y, al terminar esa otra, workerd dejaba colgada su E/S: 3 pagos simultáneos de clientes distintos dejaban uno colgado con la transacción abierta. Las transacciones interactivas usan `conTransaccion()` (`datos/prisma.ts`): un `PrismaClient` propio por transacción sobre la conexión de la petición. Hoy solo la confirmación lo necesita.
- Cada reserva escribe 2 + 2·N filas para N productos (4 con un producto, con tablas `WITHOUT ROWID`); el límite gratuito es de 100.000 filas escritas al día.
- Medido en producción en el Sprint 0: 300 reservas concurrentes sobre 5 unidades dan exactamente 5; espera en el objeto p50 132 ms y p95 383 ms; 1 subrequest por reserva.
- Sin cuota mensual de comandos, y una pieza externa menos. Las pruebas locales corren en el Durable Object local de `wrangler dev`.

### 5.3 Cómo se decidió (Sprint 0)

**Resultado: se eligió la opción B.** Pasó los cuatro criterios con margen y no suma una pieza externa. Como la B pasó, la A no llegó a prototiparse. Detalle en `docs/compatibilidad-cloudflare.md`, sección "Confirmación de la opción B".

Criterios aplicados. El plan original era probar ambas opciones con Wrangler y registra los resultados en `docs/compatibilidad-cloudflare.md`:
1. **Atomicidad**: 300 intentos concurrentes de reservar el mismo componente de 5 unidades dan exactamente 5 reservas; una reserva de varios productos es todo o nada.
2. **Funcionamiento en Workers**: Lua por REST funciona (opción A) o el Durable Object funciona con la configuración de Wrangler (opción B).
3. **Consumo**: comandos por reserva y proyección mensual (opción A) o filas escritas y peticiones por día (opción B).
4. **Latencia** de una reserva, medida y documentada.

Regla de decisión propuesta: se elige la opción A si pasa las pruebas y su consumo proyectado para las pruebas y la demo queda por debajo de la mitad de la cuota mensual; se elige la opción B si la A falla o su consumo o latencia son inaceptables, o si el desarrollador prefiere una pieza externa menos. La decisión y su motivo quedan escritos en el mismo archivo antes de empezar el Sprint 1. Si se elige la B, se actualizan las referencias a Upstash en la parte técnica y en los Sprints 0, 1, 3, 6 y 7.

## 6. Reglas de construcción

- TypeScript estricto. Validación de entradas con DTOs (class-validator).
- Errores de negocio devuelven `{ codigo, mensaje }` con mensaje comprensible para el usuario.
- Guardas por rol en todo endpoint administrativo.
- Cloudflare y Wrangler: `wrangler.jsonc` versionado y sin secretos; `compatibility_date` igual o posterior a `2026-08-04`; secretos con `wrangler secret put` en producción y `.dev.vars` (en `.gitignore`) en local; despliegue con `wrangler deploy`, manual o desde CI con `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` como secretos de GitHub.
- Mantener `.env.example` y `.dev.vars.example` actualizados. Nunca versionar secretos.
- Compatibilidad con Workers: sin binarios nativos (por ejemplo `argon2` o `bcrypt` nativos), sin `fs`, `child_process` ni `worker_threads`, sin estado en memoria entre peticiones, sin WebSockets. Hash de contraseñas con Web Crypto: **PBKDF2-SHA256 con 50.000 iteraciones** (~6,5 ms de CPU; Workers no admite más de 100.000), guardado como `pbkdf2$<iteraciones>$<sal>$<hash>`. Cliente de base de datos: Prisma con `@prisma/adapter-pg` por Hyperdrive, siempre a través de `conPrisma()` (sección 2.0.1).
- Tareas programadas con Cron Triggers (handler `scheduled`), no con `@nestjs/schedule`.
- Sesiones por cookie `httpOnly` guardadas en Postgres, con vencimiento (sección 2.2).
- Límite de peticiones: registro (por IP), inicio de sesión (por correo y por IP) y asistente de IA (por usuario). Los contadores de registro e inicio de sesión viven en el Durable Object `Limites`; el del asistente se cuenta desde `uso_asistente` en Postgres (sección 2.2).
- Cuidar los subrequests (máximo 50 por petición) y la CPU (10 ms en el plan gratuito): una reserva debe resolverse con pocas llamadas.
- Pruebas unitarias junto a cada módulo; pruebas de integración contra Postgres y el almacén de disponibilidad reales en local; pruebas de extremo a extremo de navegador con **Playwright** (`tests/e2e/`, `pnpm test:e2e`), que levantan la API con `wrangler dev` y el frontend con `next build` + `next start`. Corren en el job `e2e` de la CI, del que depende el despliegue. Las marcadas `@humo` son de solo lectura y también corren contra producción con `E2E_URL=https://xdtech.store`.
- No introducir tecnologías fuera del stack (sin colas de mensajes, sin balanceador, sin otra base de datos). Las imágenes de producto van en R2, el almacenamiento de objetos de Cloudflare (Sprint 1.5).
- Frontend por capas: `app → features → components → lib`; los componentes de presentación reciben los datos por props y solo los contenedores leen la API. ESLint lo comprueba, y `pnpm lint` también rechaza colores fuera de `styles/tokens.css`.
- Cada sprint termina con: código en la rama principal, CI en verde y las pruebas del sprint pasando.

## 7. Valores por defecto (configurables)

| Parámetro | Valor | Dónde se configura |
|---|---|---|
| TTL de reservas | 10 min | `RESERVA_TTL_MIN` (admite decimales: las pruebas usan 0.05 = 3 s) |
| Margen de potencia de la fuente | 20 % | Parámetro `margenPorcentaje` de la regla `POTENCIA` en `reglas_compatibilidad` |
| Consumo base (placa, RAM, almacenamiento) | 0 W | Parámetro `consumoBaseW` de la regla `POTENCIA` |
| Escenario de carga | 300 usuarios virtuales, componente con 5 unidades | Script k6 |
| Timeout de la API de IA | Configurable | Variable de entorno |
| Duración de la sesión | 7 días | Variable de entorno |
| Límite de registro | 5 registros por hora por IP | `LIMITE_REGISTRO_MAX`, `LIMITE_REGISTRO_VENTANA_MIN` |
| Límite de inicio de sesión | 5 intentos fallidos por 15 min por correo; 50 por 15 min por IP | `LIMITE_LOGIN_CORREO_MAX`, `LIMITE_LOGIN_IP_MAX`, `LIMITE_LOGIN_VENTANA_MIN` |
| Límite del asistente | 10 consultas por 24 h por usuario | Variable de entorno |
| Reconciliación periódica | cada 5 min | Cron Trigger en `wrangler.jsonc` |
| Pago simulado | `4242 4242 4242 4242` aprueba, `4000 0000 0000 0002` rechaza; cualquier otra tarjeta válida (Luhn) aprueba | `PAGO_SIMULADO_FORZAR` (`APROBAR` o `RECHAZAR`; vacía en producción) |
| Número de comprobante | `XD-000001`, correlativo global | Secuencia `comprobante_numero_seq` (migración `comprobantes_correlativo`) |

## 8. Cómo trabajar con los sprints

1. Lee este documento y luego solo el `sprint_0X.md` actual.
2. Implementa únicamente las historias de ese sprint; no adelantes funcionalidades de sprints posteriores.
3. Cuando una historia dependa de algo de un sprint anterior, asume que ya existe y úsalo.
4. Al terminar, verifica la definición de hecho del sprint antes de pasar al siguiente.

| Sprint | Archivo | Foco |
|---|---|---|
| 0 | `sprint_00_fundamentos.md` | Base técnica y validación de compatibilidad con Cloudflare |
| 1 | `sprint_01_usuarios_catalogo.md` | Usuarios y catálogo |
| 1.5 | `Sprint 1.5 Rediseño del frontend.md` | Sistema de diseño, frontend por capas, marca, filtros, facetas e imágenes de producto (el plan pasa de 8 a 9 semanas) |
| 2 | `sprint_02_motor_reglas.md` | Motor de reglas y armador manual |
| 3 | `sprint_03_concurrencia_carrito.md` | Concurrencia y carrito |
| 4 | `sprint_04_pago_historial.md` | Pago, notificaciones e historial |
| 5 | `sprint_05_asistente_ia.md` | Asistente de IA |
| 6 | `sprint_06_administracion.md` | Administración y endurecimiento |
| 7 | `sprint_07_despliegue.md` | Despliegue final y cierre |

## 9. Criterios de aceptación globales

- Todos los requerimientos funcionales cubiertos y probados.
- Ninguna configuración incompatible llega al carrito, ni siquiera la generada por IA.
- El escenario de 300 usuarios concurrentes sobre un componente limitado termina sin sobreventa y con stock consistente entre el almacén de disponibilidad y Postgres.
- La liberación de reservas expiradas funciona sin intervención manual.
- Sistema desplegado en línea por HTTPS en Cloudflare.

Plan de recorte si el tiempo se acorta: mantener siempre concurrencia (Sprint 3) y compra de extremo a extremo (Sprint 4); recortar en este orden HU-34, HU-33, HU-15, HU-32, HU-26.

## 10. Alcance diferido, desviaciones y justificación

### Recuperación de acceso por correo (HU-03, diferida)
- **Requerimiento afectado:** RF-03 de la propuesta original, "recuperación de acceso mediante los mecanismos definidos para la aplicación".
- **Decisión:** se difiere a una mejora futura y no se implementa en las 8 semanas.
- **Justificación (para el informe):** exige un proveedor de correo externo, verificación del dominio emisor (SPF y DKIM) y un canal adicional que cuidar en un despliegue de planes gratuitos con un solo desarrollador. No participa en el objetivo central de la asignatura (consistencia del stock bajo concurrencia) ni en el flujo de compra.
- **Mitigación actual:** el registro y el inicio de sesión funcionan con normalidad; el usuario que olvide su contraseña debe registrar una cuenta nueva.
- **Mejora futura sugerida:** recuperación por enlace de un solo uso enviado por correo, con un proveedor de API HTTP (por ejemplo Resend), dominio `xdtech.store` verificado, tabla `tokens_recuperacion` (token de un solo uso con vencimiento) y límite de peticiones por correo. Alternativa sin correo: restablecimiento de contraseña por un administrador desde el panel, con contraseña temporal.
- **Efecto en los documentos:** se elimina HU-03 y la tabla `tokens_recuperacion`; no existen los endpoints `/auth/recuperar` ni `/auth/restablecer`.

### Desviaciones respecto a la propuesta original (para el informe)
- **Se mantiene:** Node.js, NestJS, PostgreSQL, claves de idempotencia, bloqueo optimista y el servicio de IA generativa.
- **Cambia el despliegue:** el backend corre sobre Cloudflare Workers, que ya es serverless y escala sin estado, en lugar de instancias Docker detrás de NGINX. La cola BullMQ para expirar reservas se reemplaza por Cron Triggers más la expiración perezosa en cada reserva. Se usan planes gratuitos en lugar del hardware sugerido en la propuesta.
- **Caché de concurrencia:** la propuesta plantea Redis con scripts Lua. En su lugar se usa un Durable Object de Cloudflare con SQLite: sus peticiones se procesan una por una, así que da la misma atomicidad que un script Lua, sin una pieza externa. La decisión y sus mediciones constan en `docs/compatibilidad-cloudflare.md`.
- **Justificación:** el escalado horizontal sin estado que pedía la propuesta lo da la plataforma sin balanceador propio, y el plan se ajusta al presupuesto gratuito y a un solo desarrollador. Confirmar con el docente si la propuesta es vinculante en este punto.

### Deuda técnica registrada (Sprint 1.5)
- **`productos.marca` admite nulos** para no romper la migración sobre datos existentes. La API la exige al crear y la semilla la completa; cuando todos los productos la tengan, se puede pasar a `NOT NULL`.
- **Región de Neon (`us-east-2`) lejos de los Workers (São Paulo):** cada consulta suma ~150 ms y deja el rendimiento de Lighthouse móvil en 71–79 (objetivo 80). Decisión del desarrollador (Sprint 1.5): revisar la región en el Sprint 7; la opción es AWS `sa-east-1`.
- **Las imágenes las sirve el Worker de la API** (`GET /productos/:id/imagen/:archivo`) con caché inmutable del navegador. Si el consumo de peticiones del plan gratuito aprieta, se agrega `caches.default` o un dominio público para el bucket.

### Pago simulado y comprobantes (Sprint 4)
- **No hay pasarela real** (fuera de alcance): el pago simulado decide por la tarjeta de prueba. Los datos de tarjeta no se guardan ni se registran; solo los 4 últimos dígitos quedan en el comprobante.
- **Deuda para una pasarela real:** si el pago se aprueba y la confirmación falla después (por ejemplo, un ajuste de stock del ADMIN), aquí no se cobra nada; con una pasarela real habría que reembolsar o anular la autorización.
- **Huecos en la numeración:** `nextval` no se deshace si la transacción falla después de tomarlo. Se toma después de crear la orden y antes de los últimos pasos para que sea improbable; si ocurre, se ve un salto, nunca un número repetido.
- **Estado de la orden:** una orden solo existe cuando el pago se confirmó, así que su estado es siempre "Pagada" y no hay columna. Tampoco se marca qué configuración se compró: la reserva expande las configuraciones a productos.

### Criterio de trazabilidad
Al cerrar el proyecto, RF-03 se reporta como "diferido con justificación", no como cumplido.

## 11. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| 10 ms de CPU por petición en el plan gratuito (hash de contraseñas, validaciones) | Peticiones rechazadas o lentas | Medido en el Sprint 0: NestJS y Prisma inicializados en el ámbito global, un `PrismaClient` por instancia y PBKDF2 con 50.000 iteraciones. Lo que aún pasa de 10 ms es la primera consulta de cada instancia (20–39 ms). Se vigila con `wrangler tail` y con el escenario de carga del Sprint 3 |
| 100.000 consultas al día de Hyperdrive en el plan gratuito | Las consultas fallan hasta las 00:00 UTC | Pocas consultas por petición y por ejecución del cron de cada minuto (1.440 al día); vigilar el consumo antes de la demo |
| La protección del borde de Cloudflare responde 429 a muchas peticiones simultáneas desde una sola IP | Una prueba de carga lanzada desde una máquina no llega al Worker | En el Sprint 0, 300 peticiones simultáneas desde una IP recibieron 429 en `api.xdtech.store`. Las pruebas de carga se lanzan contra `*.workers.dev` o se ajusta la regla de la zona |
| 100.000 peticiones al día en el plan gratuito | La API deja de responder a mitad del día | Pruebas de carga en local con `wrangler dev`; vigilar el consumo antes de la demo |
| 50 subrequests por petición | Operaciones largas fallan | Pocas llamadas por operación; medir en el Sprint 0 |
| El Durable Object único es un cuello de botella o supera las filas escritas al día | Reservas lentas o rechazadas | Medido en el Sprint 0: p95 383 ms con 300 concurrentes y 4 filas por reserva; repetir con el escenario k6 del Sprint 3. Respaldo: opción A (sección 5.1) detrás del mismo puerto |
| El almacén de disponibilidad pierde datos | Contadores de disponible incorrectos | Tabla de reservas en Postgres, reconstrucción perezosa por producto y reconciliación periódica |
| Neon suspendido al primer acceso | Primera petición lenta | Tiempo de espera razonable en la conexión; calentar la base de datos antes de la demo |
| La IA propone configuraciones inválidas | Mala experiencia | El motor de reglas siempre valida; un reintento con los motivos; respaldo determinístico |
| La API de IA falla o se encarece | Asistente no disponible | Timeout, límite por usuario, proveedor intercambiable y respaldo determinístico |
| Cambios en los planes gratuitos | Despliegue inestable | Confirmar límites antes de la demo; mantener la opción de ejecutar el backend con `wrangler dev` y Docker local |
| El dominio es el único costo | `xdtech.store` no disponible al empezar | Comprarlo y configurar su DNS en Cloudflare antes del Sprint 0 |
| Alcance excesivo para 8 semanas | Retrasos | Concurrencia y compra primero; reportes y refinamientos al final (plan de recorte en la sección 9) |

## 12. Decisiones fijadas

Todas validadas en el Sprint 0 (`docs/compatibilidad-cloudflare.md`).

| Tema | Estado | Detalle |
|---|---|---|
| Plataforma de despliegue | **Fijada** | Cloudflare, con el CLI Wrangler; despliegue automático desde la CI en `main` |
| Base de datos | **Fijada** | PostgreSQL en Neon con Prisma 7 y `@prisma/adapter-pg`, por Hyperdrive con el caché desactivado |
| Framework del backend | **Fijada** | NestJS (Hono descartado) |
| Frontend | **Fijada** | Next.js en Cloudflare con OpenNext (Vercel descartado) |
| Caché de concurrencia | **Fijada** | Durable Object `Inventario` con SQLite (opción B); Upstash solo como respaldo |
| Hash de contraseñas | **Fijada** | PBKDF2-SHA256 con Web Crypto, 50.000 iteraciones |
| Imágenes de producto | **Fijada** (Sprint 1.5) | Cloudflare R2, una imagen opcional por producto (JPEG, PNG o WebP, hasta 2 MB), subida por el ADMIN |
| Nombre de la tienda | **Fijada** (Sprint 1.5) | XDTech; logo de texto con el degradado de marca |
| Sesión e IP | **Fijada** | Cookie `Domain=.xdtech.store` (Chrome, Brave y Firefox) e IP desde `CF-Connecting-IP` |
