# Arquitectura de despliegue

> Documento de contexto para el agente. Complementa `00_parte_tecnica.md` (que manda ante cualquier diferencia) y no define historias. Todo lo marcado **a validar** se comprueba en el Sprint 0 y se registra en `docs/compatibilidad-cloudflare.md`.

## 1. Arquitectura de alto nivel

### 1.1 Vista general

```mermaid
flowchart LR
    U[Navegador del cliente] -->|HTTPS| CF[Red de Cloudflare<br/>DNS + CDN + TLS]
    CF -->|xdtech.store| WEB[Frontend Next.js<br/>en Cloudflare]
    CF -->|api.xdtech.store| API[Worker: API NestJS]
    WEB -->|fetch con cookie| API
    API -->|SQL por Hyperdrive, adapter-pg| PG[(Neon Postgres<br/>fuente de verdad)]
    API -->|disponibilidad| AV{{Almacén de disponibilidad<br/>Durable Object Inventario}}
    API -->|HTTPS| LLM[API del LLM]
    CRON[Cron Triggers] -->|scheduled| API
    GH[GitHub Actions] -->|wrangler deploy + migraciones| CF
    GH -->|migraciones| PG
```

### 1.2 Piezas

| Pieza | Rol | Plataforma | Estado |
|---|---|---|---|
| Cloudflare (DNS, CDN, TLS) | Entrada única para `xdtech.store` y `api.xdtech.store` | Cloudflare | Fijo |
| Frontend | Next.js: catálogo, armador, carrito, panel | Cloudflare, con `@opennextjs/cloudflare` | Validado (Sprint 0) |
| API | NestJS (adaptador Express) como Worker | Cloudflare Workers | Validado (Sprint 0) |
| Base de datos | Postgres, fuente de verdad de stock, órdenes, sesiones y uso del asistente | Neon, por Cloudflare Hyperdrive (Prisma con `@prisma/adapter-pg`, caché desactivado) | Fijo y validado |
| Almacén de disponibilidad | Disponible = físico − reservas activas, con reservas atómicas y TTL | Durable Object `Inventario` con SQLite (opción B) | Decidido en el Sprint 0 |
| Tareas programadas | Expiración, reconciliación, limpieza de sesiones | Cron Triggers de Cloudflare | Fijo |
| Proveedor de IA | Recomendaciones, detrás de la interfaz `ProveedorIA` | API externa del LLM | Fijo (proveedor intercambiable) |
| CI/CD | Pruebas, migraciones y despliegue | GitHub Actions + Wrangler | Fijo |

No hay cola de mensajes, balanceador propio, servidor siempre encendido ni monitor externo.

### 1.3 Principios que condicionan el diseño

1. **Postgres es la verdad; el almacén de disponibilidad es la vía rápida.** Si el almacén se pierde, se reconstruye desde Postgres.
2. **Los Workers no guardan estado entre peticiones.** Nada en memoria: ni contadores, ni sesiones, ni cachés de stock.
3. **La IA solo recomienda.** No participa en reservas ni en pagos, y toda recomendación pasa por el motor de reglas.
4. **Cada decisión de plataforma se prueba antes de depender de ella** (Sprint 0).

### 1.4 Dominios y red

| Host | Destino | Mecanismo |
|---|---|---|
| `xdtech.store` | Frontend | Custom Domain del Worker del frontend; `www.xdtech.store` redirige con 308 |
| `api.xdtech.store` | Worker de la API | Custom Domain del Worker |

- Ambos comparten el sitio `xdtech.store`, por lo que la cookie de sesión usa `Domain=.xdtech.store` y `SameSite=Lax`.
- CORS con credenciales solo para el origen del frontend.
- La IP del cliente se lee de `CF-Connecting-IP`; `req.ip` no es fiable en Workers.

### 1.5 Flujos principales

**Compra con reserva (camino crítico)**

```mermaid
sequenceDiagram
    participant C as Cliente
    participant A as API (Worker)
    participant S as Almacén de disponibilidad
    participant P as Postgres (Neon)
    C->>A: POST /reservas
    A->>S: expirar vencidas + reservar todo o nada
    S-->>A: OK o falta producto X
    A->>P: registrar reserva ACTIVA
    A-->>C: reserva con tiempo restante
    C->>A: POST /pagos (Idempotency-Key)
    A->>P: transacción: UPDATE stock ... WHERE cantidad >= n AND version = v
    A->>P: crear orden (clave de idempotencia única)
    A->>S: cerrar reserva sin devolver stock
    A-->>C: orden confirmada
```

**Asistente de IA:** el cliente indica presupuesto y uso, la API preselecciona candidatos con stock desde Postgres, llama al LLM (JSON), valida con el motor de reglas, reintenta una vez con los motivos de rechazo y, si falla o hay timeout, usa el armador determinístico. Registra todo en `uso_asistente`.

**Tareas programadas:** tres Cron Triggers invocan el handler `scheduled` del mismo Worker: expiración (cada minuto), reconciliación (cada 5 minutos) y limpieza de sesiones (diaria).

## 2. Arquitectura de bajo nivel

### 2.1 Worker de la API

- `wrangler.jsonc`: nombre, `main: src/worker.ts`, `compatibility_date` ≥ `2026-08-04` (con esa fecha no hace falta el flag `nodejs_compat`), Custom Domain `api.xdtech.store`, bloque `triggers.crons` con los tres horarios, variables no secretas (`COOKIE_DOMAIN`, `FRONTEND_ORIGIN`, `SESSION_TTL_DAYS`).
- `src/worker.ts`: crea una sola vez por instancia la aplicación NestJS, la expone con `createServer` de `node:http` y `httpServerHandler` de `cloudflare:node` (el puerto solo sirve como clave de enrutamiento), y exporta `{ fetch, scheduled }`.
- El handler `scheduled` decide qué trabajo ejecutar según el cron que lo disparó: `expirar`, `reconciliar` o `limpiarSesiones`.
- No hay `listen` real, `upgrade` ni WebSockets, ni `net.Server`.
- **Límites del plan gratuito** (verificados en la documentación): 100 mil peticiones al día, 10 ms de CPU por petición, 50 subrequests, 128 MB, 5 Cron Triggers. Implicación de diseño: pocas consultas por petición, un solo script o método atómico por reserva y un hash de contraseñas medido contra los 10 ms.

### 2.2 Capas dentro de la API

```
Controladores (HTTP, DTOs, guardas de sesión y rol)
        │
Servicios de dominio: catalogo, configuraciones, motor de reglas,
                      carrito, reservas, ordenes, asistente, admin
        │
Puertos: DisponibleService (almacén), ProveedorIA, Prisma (Postgres)
```

- El **motor de reglas** (6 reglas: SOCKET, RAM, POTENCIA, DIMENSIONES, FACTOR_FORMA, ALMACENAMIENTO) es código puro sin dependencias de infraestructura, con parámetros leídos de la base de datos.
- `DisponibleService` es la única puerta al almacén de disponibilidad. Su implementación usa el Durable Object `Inventario`, y el resto del código no depende de ella: si hiciera falta el respaldo con Upstash, solo cambiaría esa implementación.

### 2.3 Base de datos (Neon)

- El Worker se conecta por **Hyperdrive** (binding `HYPERDRIVE`), creado con la cadena **directa** de Neon y el **caché de consultas desactivado**. La cadena vive en la configuración de Hyperdrive, no en el Worker. La misma cadena directa se usa para las migraciones en la CI (secreto `NEON_DIRECT_URL`).
- Prisma: un `PrismaClient` por instancia del Worker y una conexión `pg` por petición, a través de `conPrisma()`.
- Hyperdrive, plan gratuito: 100.000 consultas al día, ~20 conexiones al origen y consultas de hasta 60 s.
- Las migraciones de Prisma se aplican en un paso de CI, nunca al arrancar el Worker.
- Neon suspende el cómputo tras 5 minutos sin uso (la primera petición es más lenta); antes de la demo se despierta con una petición real. Plan gratuito: 100 CU-horas al mes.
- Tablas clave para la concurrencia: `stock` (con `version`), `reservas`, `reserva_items`, `ordenes` (con `clave_idempotencia` única), `sesiones`, `uso_asistente`.

### 2.4 Almacén de disponibilidad: opción B elegida

En el Sprint 0 se eligió la **opción B**: 300 reservas concurrentes sobre 5 unidades dieron exactamente 5 en producción, con p95 de 383 ms en el objeto, 4 filas escritas y 1 subrequest por reserva. La opción A queda como respaldo no implementado. La tabla compara las dos tal como se plantearon.

| | Opción A: Upstash Redis | Opción B: Durable Object |
|---|---|---|
| Acceso | HTTP/REST con `@upstash/redis` (`eval`/`evalsha`) | Binding al Durable Object `Inventario` |
| Atomicidad | Script Lua que verifica todos los productos y descuenta todos o ninguno | Método `reservar` ejecutado en un solo hilo por el propio objeto |
| Almacenamiento | Claves `disp:{productoId}`, `reserva:{id}` con TTL, `reservas:vencimientos` | Tablas SQLite `disponible`, `reservas`, `reserva_items` |
| Expiración | `expirar.lua` | Método `expirar` |
| Reconstrucción | `SET NX` desde Postgres; clave ausente = "no inicializado", nunca cero | Método `reconstruir` desde Postgres |
| Cuota gratuita | 500 mil comandos al mes | 100 mil peticiones y 100 mil filas escritas al día (SQLite) |
| Contadores de límite de peticiones | `INCR` + `EXPIRE` | En el mismo objeto u otro objeto dedicado |
| Riesgo principal | Consumo de comandos y latencia por REST | Un solo objeto concentra toda la carga; probar con 300 concurrentes |

La elección se tomó con la regla de la sección 5.3 de `00_parte_tecnica.md` y está registrada en `docs/compatibilidad-cloudflare.md`.

### 2.5 Sesiones y límites de peticiones

- Sesión: token opaco aleatorio en cookie `httpOnly; Secure; SameSite=Lax; Domain=.xdtech.store`, 7 días. En Postgres se guarda solo el hash del token (tabla `sesiones`). Sin JWT.
- Límites: registro por IP (5/hora), inicio de sesión por correo (5 fallos/15 min, se reinicia al acertar) y por IP (50/15 min), asistente por usuario (10/24 h contado desde `uso_asistente`). Los contadores de registro e inicio de sesión viven en el Durable Object `Limites`, nunca en la memoria del Worker. La IP se lee de `CF-Connecting-IP`, agrupando las direcciones IPv6 por prefijo /64.

### 2.6 Frontend

- Next.js desplegado en Cloudflare con OpenNext y Wrangler (validado en el Sprint 0). El build se hace en Linux (CI): en Windows falla por los enlaces simbólicos de pnpm.
- Llama a la API con `credentials: 'include'` hacia `api.xdtech.store`; no guarda tokens en el navegador.
- Variable pública con la URL de la API definida en tiempo de compilación.

### 2.7 CI/CD

```mermaid
flowchart LR
    PR[Push / PR] --> CI[Instalar, lint, pruebas<br/>Postgres como servicio]
    CI --> B[Build]
    B -->|rama principal| M[Migraciones con la cadena directa de Neon]
    M --> D[wrangler deploy: API y frontend]
```

- Secretos de CI: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` y `NEON_DIRECT_URL` (cadena directa de Neon, solo para migraciones).
- Secretos del Worker con `wrangler secret put`: solo la clave de la IA (Sprint 5). El Worker no necesita la cadena de Neon, que vive en Hyperdrive. Nada de secretos en el repositorio; `.dev.vars` fuera de git.

### 2.8 Entornos

| Entorno | API | Postgres | Almacén | Uso |
|---|---|---|---|---|
| Local | `wrangler dev` | Docker (`localConnectionString` de Hyperdrive) | Durable Object local de `wrangler dev` | Desarrollo y k6 |
| CI | Pruebas de integración | Servicio Postgres | Durable Object dentro de workerd (Vitest) | Verificación |
| Producción | Worker en `api.xdtech.store` | Neon por Hyperdrive | Durable Object `Inventario` | Demo |

Plan de respaldo para la demo: backend con `wrangler dev` y Postgres en Docker local.

### 2.9 Salud y observabilidad

- `GET /health/live`: sin dependencias, responde 200.
- `GET /health/ready`: verifica Postgres y el almacén de disponibilidad (503 si falla); solo para CI y uso manual.
- Registros de Workers consultables con Wrangler (`wrangler tail`, a validar). Sin monitor externo.

### 2.10 Seguridad en el despliegue

- HTTPS de extremo a extremo gestionado por Cloudflare.
- CORS restringido al origen del frontend; cookie `Secure` y `httpOnly`.
- Guardas de rol en todos los endpoints administrativos; validación de DTOs.
- La clave del LLM solo existe como secreto del Worker.
- Revisión final de que no haya secretos en el repositorio (Sprint 6).

## 3. Riesgos de despliegue y respuesta

| Riesgo | Efecto | Respuesta |
|---|---|---|
| CPU por encima de 10 ms en la primera consulta de cada instancia (20–39 ms medidos) | Peticiones lentas o rechazadas bajo carga | Inicialización global de NestJS y Prisma (ya aplicada); vigilar con `wrangler tail` y con k6 en el Sprint 3 |
| Hash de contraseñas excede 10 ms | Errores en login | PBKDF2 con 50.000 iteraciones (~6,5 ms medidos) |
| Cuota del almacén (100.000 filas escritas al día) o de Hyperdrive (100.000 consultas al día) agotada | Reservas o consultas fallan | Pruebas de carga repetidas en local; una sola corrida contra producción; respaldo con Upstash detrás del mismo puerto |
| 429 del borde de Cloudflare con muchas peticiones simultáneas desde una IP | Una prueba de carga desde una sola máquina no llega al Worker | Lanzarla contra `*.workers.dev` o ajustar la regla de la zona |
| Neon dormido en la demo | Primera petición lenta | Despertar antes de empezar |
| Pérdida de datos del almacén | Disponible incorrecto | Reconstrucción perezosa y reconciliación cada 5 minutos |

## 4. Orden de verificación

1. Sprint 0: nueve pruebas de compatibilidad y decisión del caché (hechas; todas OK).
2. Sprint 3: prueba k6 local (300 concurrentes sobre 5 unidades dan exactamente 5 reservas).
3. Sprint 7: despliegue final, verificación de cookie entre subdominios, los tres Cron Triggers y la prueba de humo en producción.
