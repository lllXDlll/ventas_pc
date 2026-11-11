# Parte técnica: especificaciones y reglas de construcción

> Léelo completo antes de cualquier sprint. Es el contexto fijo del proyecto. Las historias de usuario están en `sprint_0X.md`; cada sprint se implementa en orden y solo se lee el del sprint actual.

## 1. Descripción del proyecto

Plataforma web de venta de computadoras y componentes. El cliente arma su PC manualmente o con un asistente de IA que recomienda según presupuesto y uso. Toda configuración se valida con un motor de reglas de compatibilidad. El punto crítico es la **concurrencia**: 300 usuarios simultáneos compitiendo por un componente de stock limitado sin sobreventa.

Fuera de alcance: pasarelas de pago reales, logística de envío, garantías y servicio técnico, marketplace multivendedor, comparación con otras tiendas, diagnóstico de hardware con IA, chatbot de soporte general, reconocimiento de imágenes. Diferido a una mejora futura: la recuperación de contraseña por correo (ver sección 10).

## 2. Stack y despliegue

**El despliegue se realiza en Cloudflare, con el CLI Wrangler.** La base de datos es **Neon** (decisión fijada). El caché de concurrencia **no está decidido**: se decide en el Sprint 0 con pruebas (ver sección 5.3).

| Pieza | Tecnología / servicio | Estado |
|---|---|---|
| Frontend | Next.js desplegado en Cloudflare con Wrangler | Plataforma fijada; compatibilidad de Next.js a validar en el Sprint 0. Plan B: Vercel |
| Backend | NestJS (TypeScript, adaptador Express) sobre Cloudflare Workers | Plataforma fijada; compatibilidad de NestJS a validar en el Sprint 0. Plan B: Hono |
| Base de datos | PostgreSQL en Neon + Prisma | **Fijada** |
| Caché / concurrencia | Opción A: Redis en Upstash (REST + Lua). Opción B: Durable Object con SQLite en Cloudflare | **Por decidir en el Sprint 0** |
| IA | API de un LLM (Claude) tras un adaptador intercambiable | Fijada |

### 2.0 Principio de validación de compatibilidad

Cloudflare es la plataforma, pero **ningún supuesto de compatibilidad se da por cierto hasta que una prueba lo confirme**. En el Sprint 0 el agente ejecuta las pruebas de humo (HU-36b) con Wrangler y registra cada resultado en `docs/compatibilidad-cloudflare.md`, con una tabla: prueba, resultado (OK o no OK), medidas y decisión tomada. Ningún sprint posterior se construye sobre algo que no tenga resultado OK o una decisión documentada de plan B. Ese archivo es también insumo del informe final.

### 2.0.1 Cómo corre NestJS en Workers

- Los Workers no ejecutan un servidor Node tradicional. Se usa `node:http` con `httpServerHandler` de `cloudflare:node`: NestJS se inicializa una vez por instancia del Worker y sus peticiones se enrutan al servidor HTTP. El puerto que se pasa a `listen()` es solo una clave de enrutamiento, no un puerto de red.
- Con fecha de compatibilidad `2026-08-04` o posterior no hace falta ningún flag de Node.js (`nodejs_compat` viene activado). Con fechas anteriores habría que agregarlo.
- Soportado: `http`, `https`, `crypto`, `buffer`, `stream`, `events`, `url`, `path`, `process`, `util`, `zlib`, Web Crypto. `net` solo para conexiones TCP salientes (`net.Server` no existe). `child_process`, `worker_threads`, `cluster`, `vm` y similares son stubs que no funcionan.
- No hay eventos `upgrade` (sin WebSockets), ni trailers, ni acceso real al socket. Por eso `req.socket.remoteAddress` y `req.ip` **no sirven** para obtener la IP del cliente (ver 2.2).
- Cada petición puede ejecutarse en una instancia distinta y efímera del Worker: **no se guarda estado en memoria entre peticiones**.
- La documentación no nombra a NestJS, Express ni Fastify. Que funcionen es una hipótesis que se valida en el Sprint 0.

### 2.1 Notas operativas y límites

- **Workers, plan gratuito** (documentación de Cloudflare; reconfirmar antes de la demo): 100.000 peticiones al día (se reinicia a las 00:00 UTC), 10 ms de CPU por petición (la espera de red no cuenta, el hash de contraseñas sí), 50 subrequests por petición (cada `fetch` cuenta, incluidas las llamadas a Redis por REST), 128 MB de memoria, 5 Cron Triggers por cuenta, 64 MiB de tamaño del Worker sin comprimir.
- **Durable Objects, plan gratuito** (solo con almacenamiento SQLite): 100.000 peticiones al día, 13.000 GB-s de duración al día, 5 millones de filas leídas al día, 100.000 filas escritas al día y 5 GB almacenados. Relevante solo si se elige la opción B.
- **Neon:** 100 CU-hours por proyecto al mes; el cómputo se suspende tras 5 min sin actividad y eso no se puede cambiar. La primera petición tras un rato sin tráfico despierta la base de datos; configurar un tiempo de espera de conexión razonable. Neon requiere dos cadenas de conexión: una para la app y otra directa para las migraciones.
- **Upstash** (solo si se elige la opción A): 500K comandos al mes en el plan gratuito. Las pruebas repetidas de concurrencia se hacen contra un Redis local, no contra Upstash en la nube.
- **Endpoints de salud:** `GET /health/live` (sin dependencias, responde 200) y `GET /health/ready` (verifica Postgres y el almacén de disponibilidad; 503 si alguno falla; solo para CI y uso manual). En Workers no hay arranque en frío de un servicio dormido, por lo que **no se necesita monitor externo**.
- Docker queda para desarrollo local, pruebas de integración y pruebas de carga. El backend se ejecuta en local con `wrangler dev`.
- El proyecto no envía correos: las notificaciones son dentro de la aplicación. No hay proveedor de correo ni configuración SPF/DKIM.
- Costo: todo usa planes gratuitos **excepto el dominio `xdtech.store`**, que tiene costo de compra y de renovación anual. Debe estar comprado y con su DNS administrado en Cloudflare **antes de empezar el Sprint 0**.

### 2.2 Dominio, sesión y límites de peticiones (decisiones fijadas)

**Dominio y DNS.** Dominio propio `xdtech.store` con DNS en Cloudflare.
- API: `api.xdtech.store`, configurado como **Custom Domain del Worker** (Cloudflare gestiona el registro y el certificado; validar en el Sprint 0).
- Frontend: `xdtech.store` o `app.xdtech.store`, también como Custom Domain en Cloudflare. Si el Sprint 0 obliga al plan B (Vercel), el frontend se sirve desde Vercel con el DNS en Cloudflare: nube gris, o nube naranja con SSL "Full (strict)" y sin caché para respuestas con `Set-Cookie`.
- Ambos subdominios son del mismo sitio para el navegador: no hay proxy desde Next.js ni cookies de terceros.

**Sesión.** Cookie de sesión con identificador opaco; la sesión se guarda en Postgres (tabla `sesiones`).
- Cookie: `httpOnly; Secure; SameSite=Lax; Domain=.xdtech.store` (en desarrollo local, sin `Domain` ni `Secure`).
- El valor de la cookie es un token aleatorio; en la base de datos solo se guarda su hash.
- Vencimiento: 7 días (variable de entorno). Cerrar sesión marca la sesión como revocada.
- Limpieza: un **Cron Trigger diario** borra las sesiones vencidas y las revocadas con más de un día; además, al iniciar sesión se borran las vencidas o revocadas de ese usuario. Una sesión vencida o revocada siempre se rechaza, se haya borrado o no.
- CORS: la API permite credenciales únicamente desde el origen del frontend (variable de entorno), nunca con comodín.
- Se descarta JWT: no permite invalidar la sesión al cerrar sesión sin una lista de bloqueo adicional.

**Límites de peticiones (rate limiting).**
- **Registro:** límite por IP. Limitar por correo no protege, porque quien abusa cambia de correo en cada intento.
- **Inicio de sesión:** límite por correo (cuenta solo los intentos **fallidos** y se borra al acertar) y, además, un límite por IP más holgado.
- **Asistente de IA:** límite por usuario autenticado, contado a partir de las filas de `uso_asistente` de las últimas 24 horas (dato durable en Postgres).
- **IP real del cliente:** se lee del encabezado `CF-Connecting-IP` que agrega Cloudflare. **No usar `req.ip`, `req.socket.remoteAddress` ni `trust proxy`**: en Workers el socket es simulado.
- **Dónde viven los contadores de registro e inicio de sesión:** en el almacén de disponibilidad elegido en el Sprint 0. Opción A: Upstash con `INCR` más `EXPIRE`, solo en esas dos rutas. Opción B: un Durable Object de límites. Alternativa a evaluar en cualquiera de los dos casos: el límite de peticiones propio de Cloudflare, si el plan gratuito lo permite (no verificado). **Nunca en memoria del Worker** (cada petición puede caer en otra instancia) **ni en KV** (es eventualmente consistente y no sirve para contadores).
- Los valores concretos son configurables por variables de entorno (ver sección 7).

## 3. Estructura del repositorio

```
repo/
  apps/
    web/                 Next.js (frontend)
    api/                 NestJS (backend)
      wrangler.jsonc     configuración de Wrangler (sin secretos)
      src/
        worker.ts        entrada del Worker: inicia NestJS, exporta fetch (httpServerHandler) y scheduled
        auth/            registro, sesión, roles
        catalogo/        productos, atributos técnicos, stock
        compatibilidad/  motor de reglas
        asistente/       adaptador de IA y respaldo determinístico
        carrito/
        reservas/        almacén de disponibilidad (Lua u objeto Durable) y reconciliación
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
  docker-compose.yml     Postgres y Redis locales
  .github/workflows/     integración continua y despliegue con Wrangler
```

## 4. Modelo de datos (Prisma)

| Tabla | Contenido principal |
|---|---|
| usuarios | correo, hash de contraseña, rol (CLIENTE / ADMIN), estado |
| sesiones | hash del token de sesión, usuario, vencimiento, revocada, fecha de creación |
| categorias | procesador, placa madre, RAM, tarjeta gráfica, fuente, gabinete, almacenamiento, equipo armado |
| productos | nombre, tipo (COMPONENTE / EQUIPO), precio, activo, atributos técnicos en JSONB |
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

Atributos técnicos esperados en JSONB: `socket`, `tipoRam`, `velocidadRam`, `maxModulosRam`, `potenciaConsumidaW`, `potenciaEntregadaW`, `dimensiones` (largo GPU, alto disipador, medidas del gabinete), `factorForma`, `interfacesAlmacenamiento`.

Un equipo armado se registra como producto propio con su propio stock.

## 5. Reglas de concurrencia (no negociables)

En los sprints, "Redis" designa al **almacén de disponibilidad** elegido en el Sprint 0 (Redis en Upstash u objeto Durable). Las reglas son las mismas con cualquiera de las dos opciones.

1. **Postgres guarda la verdad**: stock físico y compras confirmadas.
2. **El almacén de disponibilidad guarda el disponible para vender** = stock físico − reservas activas.
3. Ninguna venta se confirma sin una transacción en Postgres.
4. **Reservar**: una única operación atómica verifica que todos los productos tengan disponible suficiente; si es así, descuenta todos, crea la reserva con vencimiento y la registra. Si falta alguno, no descuenta nada y devuelve cuál faltó. Si el disponible de un producto **no existe** en el almacén, la operación devuelve "no inicializado" (nunca lo trata como cero) y la API lo reconstruye desde Postgres y reintenta.
5. **Registrar**: la API guarda la reserva en Postgres con estado ACTIVA (respaldo auditable).
6. **Confirmar**: con `Idempotency-Key`, una transacción Postgres descuenta el stock físico con actualización condicional (`cantidad >= n AND version = v`), crea la orden y el comprobante y marca la reserva CONFIRMADA. Después cierra la reserva en el almacén **sin devolver stock**.
7. **Expirar**: una operación atómica devuelve al disponible las cantidades de las reservas vencidas y las elimina. Se ejecuta con un **Cron Trigger cada minuto** y **antes de cada intento de reserva**. La reserva en Postgres pasa a EXPIRADA.
8. **Reconciliar**: un Cron Trigger periódico (por ejemplo cada 5 minutos) recalcula el disponible como stock físico − reservas ACTIVAS y corrige el almacén. Además, la reconstrucción es **perezosa por producto**: si el disponible de un producto no existe, se recalcula desde Postgres sin sobrescribir uno existente. No se depende de un "arranque de la API", porque en Workers ocurre en cada instancia.
9. **Idempotencia**: cada confirmación exige el encabezado `Idempotency-Key`; una restricción de unicidad en `ordenes` hace que un reintento devuelva la orden original.
10. La IA **nunca** participa en concurrencia ni en cobro.

### 5.1 Opción A: Redis en Upstash con Lua

- Estructuras: contador de disponible por producto (`disp:{productoId}`), registro por reserva con TTL (`reserva:{id}`), índice ordenado por vencimiento (`reservas:vencimientos`).
- La reserva y la expiración son scripts Lua (`reservar.lua`, `expirar.lua`) ejecutados con `eval`/`evalsha`; Redis los procesa de forma indivisible.
- Cliente HTTP `@upstash/redis` (no `ioredis`). Cada llamada cuenta como un subrequest; el script Lua cuenta como una.
- La reconstrucción perezosa usa `SET ... NX`.

### 5.2 Opción B: Durable Object con SQLite

- Un único Durable Object `Inventario` para todo el catálogo, de modo que la reserva de varios productos sea atómica (un Durable Object procesa sus peticiones una por una). Cada reserva pasa por ese único objeto: es el posible cuello de botella a medir en el Sprint 0.
- Almacenamiento SQLite del objeto: `disponible(producto_id, cantidad)`, `reservas(id, vence_en)` y `reserva_items(reserva_id, producto_id, cantidad)`.
- Métodos: `reservar(items, vencimiento)`, `expirar()`, `cerrar(reservaId)`, `reconstruir(productoId, cantidad)` y `consultar(productoId)`. La expiración la invocan el Cron Trigger y cada `reservar`.
- Cada reserva escribe varias filas (la reserva, sus ítems y las actualizaciones del disponible); el límite gratuito es de 100.000 filas escritas al día, a medir en el Sprint 0.
- Sin cuota mensual de comandos, y una pieza externa menos. Las pruebas locales corren en el Durable Object local de `wrangler dev`.

### 5.3 Cómo se decide (Sprint 0)

El agente prueba ambas opciones con Wrangler y registra los resultados en `docs/compatibilidad-cloudflare.md`:
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
- Compatibilidad con Workers: sin binarios nativos (por ejemplo `argon2` o `bcrypt` nativos), sin `fs`, `child_process` ni `worker_threads`, sin estado en memoria entre peticiones, sin WebSockets. Hash de contraseñas con una implementación JS/WASM o con Web Crypto (PBKDF2), midiendo el tiempo de CPU (sección 2.1). Cliente de base de datos con el adaptador de Prisma para Neon, validado en el Sprint 0.
- Tareas programadas con Cron Triggers (handler `scheduled`), no con `@nestjs/schedule`.
- Sesiones por cookie `httpOnly` guardadas en Postgres, con vencimiento (sección 2.2).
- Límite de peticiones: registro (por IP), inicio de sesión (por correo y por IP) y asistente de IA (por usuario). Los contadores de registro e inicio de sesión viven en el almacén elegido en el Sprint 0; el del asistente se cuenta desde `uso_asistente` en Postgres (sección 2.2).
- Cuidar los subrequests (máximo 50 por petición) y la CPU (10 ms en el plan gratuito): una reserva debe resolverse con pocas llamadas.
- Pruebas unitarias junto a cada módulo; pruebas de integración contra Postgres y el almacén de disponibilidad reales en local; pruebas de extremo a extremo con `wrangler dev`.
- No introducir tecnologías fuera del stack (sin colas de mensajes, sin balanceador, sin otra base de datos).
- Cada sprint termina con: código en la rama principal, CI en verde y las pruebas del sprint pasando.

## 7. Valores por defecto (configurables)

| Parámetro | Valor | Dónde se configura |
|---|---|---|
| TTL de reservas | 10 min | Variable de entorno (usar valor corto en pruebas) |
| Margen de potencia de la fuente | 20 % | Parámetro en `reglas_compatibilidad` |
| Escenario de carga | 300 usuarios virtuales, componente con 5 unidades | Script k6 |
| Timeout de la API de IA | Configurable | Variable de entorno |
| Duración de la sesión | 7 días | Variable de entorno |
| Límite de registro | 5 registros por hora por IP | Variable de entorno |
| Límite de inicio de sesión | 5 intentos fallidos por 15 min por correo; 50 por 15 min por IP | Variable de entorno |
| Límite del asistente | 10 consultas por 24 h por usuario | Variable de entorno |
| Reconciliación periódica | cada 5 min | Cron Trigger en `wrangler.jsonc` |

## 8. Cómo trabajar con los sprints

1. Lee este documento y luego solo el `sprint_0X.md` actual.
2. Implementa únicamente las historias de ese sprint; no adelantes funcionalidades de sprints posteriores.
3. Cuando una historia dependa de algo de un sprint anterior, asume que ya existe y úsalo.
4. Al terminar, verifica la definición de hecho del sprint antes de pasar al siguiente.

| Sprint | Archivo | Foco |
|---|---|---|
| 0 | `sprint_00_fundamentos.md` | Base técnica y validación de compatibilidad con Cloudflare |
| 1 | `sprint_01_usuarios_catalogo.md` | Usuarios y catálogo |
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
- **Se mantiene:** Node.js, NestJS (salvo que el Sprint 0 obligue al plan B), PostgreSQL, claves de idempotencia, bloqueo optimista y el servicio de IA generativa.
- **Cambia el despliegue:** el backend corre sobre Cloudflare Workers, que ya es serverless y escala sin estado, en lugar de instancias Docker detrás de NGINX. La cola BullMQ para expirar reservas se reemplaza por Cron Triggers más la expiración perezosa en cada reserva. Se usan planes gratuitos en lugar del hardware sugerido en la propuesta.
- **Caché de concurrencia:** la propuesta plantea Redis con scripts Lua. Esa opción se mantiene como opción A; como opción B se evalúa un Durable Object de Cloudflare. La decisión final y sus mediciones constan en `docs/compatibilidad-cloudflare.md`.
- **Justificación:** el escalado horizontal sin estado que pedía la propuesta lo da la plataforma sin balanceador propio, y el plan se ajusta al presupuesto gratuito y a un solo desarrollador. Confirmar con el docente si la propuesta es vinculante en este punto.

### Criterio de trazabilidad
Al cerrar el proyecto, RF-03 se reporta como "diferido con justificación", no como cumplido.

## 11. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| NestJS no corre bien en Workers (tamaño del bundle, arranque, compatibilidad) | Hay que rehacer la estructura del backend | Prueba de humo en el Sprint 0 con medición de arranque y CPU; plan B: Hono con la misma estructura de módulos y servicios puros |
| Next.js no es compatible con el despliegue en Cloudflare | El frontend no se puede servir ahí | Prueba de humo en el Sprint 0; plan B: Vercel con el DNS en Cloudflare |
| 10 ms de CPU por petición en el plan gratuito (hash de contraseñas, validaciones) | Peticiones rechazadas o lentas | Medir en el Sprint 0; ajustar el algoritmo; si no cabe, evaluar el plan de pago de Workers |
| 100.000 peticiones al día en el plan gratuito | La API deja de responder a mitad del día | Pruebas de carga en local con `wrangler dev`; vigilar el consumo antes de la demo |
| 50 subrequests por petición | Operaciones largas fallan | Pocas llamadas por operación; medir en el Sprint 0 |
| Opción A: agotar los comandos mensuales de Upstash o Lua por REST no funciona | Las reservas dejan de funcionar | Medición temprana en el Sprint 0, pruebas repetidas en Redis local, contadores solo en registro e inicio de sesión; plan B: opción B |
| Opción B: el Durable Object único es un cuello de botella o supera las filas escritas al día | Reservas lentas o rechazadas | Medir latencia y filas escritas en el Sprint 0 con 300 usuarios concurrentes |
| El almacén de disponibilidad pierde datos | Contadores de disponible incorrectos | Tabla de reservas en Postgres, reconstrucción perezosa por producto y reconciliación periódica |
| Neon suspendido al primer acceso | Primera petición lenta | Tiempo de espera razonable en la conexión; calentar la base de datos antes de la demo |
| La IA propone configuraciones inválidas | Mala experiencia | El motor de reglas siempre valida; un reintento con los motivos; respaldo determinístico |
| La API de IA falla o se encarece | Asistente no disponible | Timeout, límite por usuario, proveedor intercambiable y respaldo determinístico |
| La cookie entre subdominios o la lectura de `CF-Connecting-IP` no funcionan | Sesiones o límites de peticiones rotos | Pruebas de humo en el Sprint 0, con plan B documentado antes del Sprint 1 |
| Cambios en los planes gratuitos | Despliegue inestable | Confirmar límites antes de la demo; mantener la opción de ejecutar el backend con `wrangler dev` y Docker local |
| El dominio es el único costo | `xdtech.store` no disponible al empezar | Comprarlo y configurar su DNS en Cloudflare antes del Sprint 0 |
| Alcance excesivo para 8 semanas | Retrasos | Concurrencia y compra primero; reportes y refinamientos al final (plan de recorte en la sección 9) |

## 12. Decisiones: fijadas, por decidir y planes B

| Tema | Estado | Detalle |
|---|---|---|
| Plataforma de despliegue | **Fijada** | Cloudflare, con el CLI Wrangler |
| Base de datos | **Fijada** | PostgreSQL en Neon, con Prisma |
| Framework del backend | Por validar | NestJS; plan B Hono si el Sprint 0 lo exige |
| Frontend | Por validar | Next.js en Cloudflare; plan B Vercel |
| Caché de concurrencia | **Por decidir** | Opción A (Upstash con Lua) u opción B (Durable Object), con la regla de la sección 5.3 |
