# Design

## Context

Motivación y alcance: ver proposal.md. Los requisitos están en `specs/` de este cambio.

Estado de partida, que deja el Sprint 0 (registro en `docs/compatibilidad-cloudflare.md`):
- La API es NestJS sobre Workers. NestJS y Prisma se inicializan en el ámbito global de `src/worker.ts`.
- Prisma usa `@prisma/adapter-pg` sobre Hyperdrive, con un `PrismaClient` por isolate. Cada llamada a `conPrisma()` abre hoy su propia conexión `pg` y la cierra al terminar (`src/datos/prisma.ts`, con `AsyncLocalStorage`).
- Las tablas `usuarios` (con `correo` de tipo `citext` único), `sesiones`, `categorias`, `productos` y `stock` (con `version` y `CHECK cantidad >= 0`) ya existen en Neon.
- El Durable Object `Limites` está declarado (binding `LIMITES`, migración `v1` con SQLite) y solo tiene `ping()`. `DisponibleService` solo tiene `ping()`.
- El cron `0 4 * * *` despacha `limpiarSesiones`, que todavía está vacía.
- El frontend tiene una sola página. Hay CORS con credenciales para `FRONTEND_ORIGIN` y un filtro global de errores `{ codigo, mensaje }`.

Restricciones medidas en el Sprint 0:
- 10 ms de CPU por petición en el plan gratuito.
- Cada conexión nueva por Hyperdrive cuesta ~4 ms de CPU por la autenticación SCRAM-SHA-256.
- PBKDF2 con 50.000 iteraciones cuesta ~6,5 ms.
- Hyperdrive admite 100.000 consultas por día, y los Durable Objects, 100.000 filas escritas por día.
- Cada llamada a un Durable Object es 1 subrequest.

## Goals / Non-Goals

**Goals:**
- Que una petición típica abra como mucho **una** conexión a Postgres.
- Que un inicio de sesión quede lo más cerca posible de los 10 ms de CPU, medido en producción.
- Que todas las piezas nuevas pasen por puertos que el Sprint 3 pueda sustituir sin tocar los controladores, en particular `DisponibleService` en el catálogo.

**Non-Goals:**
- Sesiones deslizantes (renovar el vencimiento con cada uso). La sesión vence a los 7 días desde que se crea.
- Cambio de contraseña, gestión de usuarios desde el panel y bloqueo de cuentas desde la interfaz. `BLOQUEADO` existe en el esquema y se respeta, pero en este sprint solo se asigna por SQL.
- El límite del asistente de IA (Sprint 5) y el disponible real del almacén (Sprint 3).
- Diseño visual cuidado: las pantallas son funcionales, sin sistema de diseño.

## Decisions

### D1. Una conexión a Postgres por petición HTTP
En el servidor `node:http` de `worker.ts`, cada petición se ejecuta dentro de un contexto de `AsyncLocalStorage` que guarda una conexión perezosa: se abre con la primera consulta y se cierra en el evento `close` de la respuesta. `conPrisma()` reutiliza la conexión del contexto si existe y, si no, abre una propia y la cierra al terminar, como hoy. Ese segundo caso cubre el cron y las pruebas. El `PrismaClient` y su adaptador delegado no cambian.

Advertencia: dentro de una petición, las consultas comparten una sola conexión, así que no deben lanzarse en paralelo dentro de una transacción interactiva. Fuera de una transacción, `pg` las encola.

*Alternativas:* mantener una conexión por llamada a `conPrisma()`, que cuesta ~4 ms de CPU por cada conexión adicional (en el Sprint 0, tres conexiones dieron 10,9 ms); o un middleware de NestJS, que no cubriría las rutas que fallan antes de llegar a NestJS. Se descartan las dos.

### D2. Hash de contraseñas
PBKDF2-SHA256 con Web Crypto: 50.000 iteraciones, una sal aleatoria de 16 bytes y un hash de 32 bytes. Se guarda como `pbkdf2$<iteraciones>$<sal base64url>$<hash base64url>`. La verificación lee las iteraciones del propio valor y compara en tiempo constante con `crypto.subtle.timingSafeEqual`.

Cuando el correo no existe, se calcula igualmente un PBKDF2 contra un hash ficticio con los mismos parámetros. Así el tiempo de respuesta no revela si la cuenta existe (requisito de error genérico).

*Alternativas:* argon2id en WASM, que no hace falta según la prueba 5, o 100.000 iteraciones (~13 ms), que es decisión del desarrollador y queda pendiente.

### D3. Token de sesión y cookie
- **Token:** 32 bytes aleatorios en base64url. En `sesiones.token_hash` se guarda su SHA-256 en hexadecimal. Basta un SHA-256 simple porque el token tiene 256 bits de entropía y no necesita estiramiento.
- **Cookie:** se llama `xd_sesion`, con `Path=/`, `HttpOnly` y `SameSite=Lax`. `Domain` y `Secure` se agregan solo si `COOKIE_DOMAIN` no está vacío, y `Max-Age` vale `SESSION_TTL_DAYS × 86400`.
- **Validación:** la guarda resuelve la sesión con una sola consulta (sesión + usuario por `token_hash`). La rechaza si `revocada`, si `vence_en <= now()` o si el usuario no está `ACTIVO`.
- **Cierre de sesión:** marca `revocada = true` y `revocada_en = now()`, y responde con la cookie vencida (`Max-Age=0`).

### D4. Migración: `sesiones.revocada_en`
Se agrega `revocada_en timestamptz NULL` con una migración nueva; no se edita la inicial. Se conserva `revocada`, para no cambiar el significado de las consultas existentes. La limpieza borra `vence_en < now()` o `revocada AND revocada_en < now() - interval '1 day'`. Las sesiones revocadas antes de esta migración, si las hubiera, tienen `revocada_en` nulo y caen por su vencimiento.
*Alternativa:* sustituir el booleano por la fecha. Es más limpio, pero también más invasivo; se deja para cuando haga falta.

### D5. Límites en el Durable Object `Limites`
- **Un objeto por clave**, obtenido con `idFromName`. Ejemplos de claves: `registro:ip:<ip>`, `login:correo:<correo en minúsculas>` y `login:ip:<ip>`. Cada objeto procesa sus peticiones una por una, así que contar es atómico sin bloqueos, y la carga se reparte entre muchos objetos.
- **Almacenamiento:** SQLite del objeto, con una fila `(inicio_ventana, cuenta)`. La ventana es fija y empieza en el primer intento contado, como dice la spec.
- **Métodos RPC:**
  - `consumir(max, ventanaMs)` comprueba e incrementa en un solo paso y devuelve `{ permitido, reintentarEnS }`. Se usa en el registro y en el límite de inicio de sesión por IP.
  - `consultar(max, ventanaMs)` comprueba sin incrementar; se usa para el correo antes de verificar la contraseña.
  - `registrarFallo(ventanaMs)` incrementa tras un fallo, y `reiniciar()` borra el contador tras un acierto.
- **Costo de un inicio de sesión:** 2 o 3 llamadas al objeto (IP, correo y, si falla, el fallo), es decir, 2 o 3 subrequests y de 1 a 2 filas escritas.
- Las respuestas 429 usan el código `DEMASIADAS_PETICIONES`, que ya está en el filtro de errores, y la cabecera `Retry-After`.

*Alternativas:* un solo objeto para todos los contadores (un cuello de botella sin necesidad), contadores en memoria del objeto (se pierden si el objeto se desaloja) y el rate limiting de Cloudflare (sin verificar en el plan gratuito, y no distingue fallos de aciertos).

### D6. Clave de IP
Se usa `CF-Connecting-IP` y nada más.
- Una IPv4 se usa tal cual.
- Una IPv6 se expande a sus 8 grupos y se toman los 4 primeros, que forman el prefijo /64.
- Una dirección `::ffff:a.b.c.d` se trata como IPv4.
- Sin cabecera, la clave es `sin-ip`.

Es una función pura con pruebas unitarias.

### D7. Guardas y roles
- Decorador `@RequiereSesion()` y decorador `@Roles(Rol.ADMIN)`, este último a nivel de controlador para todo `/admin`. Una guarda global lee esos metadatos. Las rutas sin decorador son públicas.
- La sesión resuelta se adjunta a la petición, y un decorador de parámetro `@UsuarioActual()` la expone.
- Una prueba e2e recorre las rutas `/admin` registradas en el router y comprueba que todas responden 401 sin sesión y 403 con rol CLIENTE. Así una ruta nueva no puede quedar abierta por olvido.

### D8. Atributos técnicos por categoría
Una tabla en código, de función pura, valida los atributos del JSONB:

| Categoría | Atributos obligatorios (tipo) |
|---|---|
| PROCESADOR | `socket` (texto), `potenciaConsumidaW` (entero positivo) |
| PLACA_MADRE | `socket` (texto), `tipoRam` (texto), `maxModulosRam` (entero positivo), `factorForma` (texto), `interfacesAlmacenamiento` (lista de textos) |
| RAM | `tipoRam` (texto), `velocidadRam` (entero positivo), `modulos` (entero positivo) |
| TARJETA_GRAFICA | `potenciaConsumidaW` (entero positivo), `largoMm` (entero positivo) |
| FUENTE | `potenciaEntregadaW` (entero positivo) |
| GABINETE | `factoresFormaSoportados` (lista de textos), `largoGpuMaxMm` y `altoDisipadorMaxMm` (enteros positivos) |
| ALMACENAMIENTO | `interfaz` (texto) |
| EQUIPO_ARMADO | ninguno obligatorio (descripción libre) |

Se admiten atributos adicionales no listados. Estos nombres siguen la sección 4 de la parte técnica y son los que leerá el motor de reglas del Sprint 2. El campo `dimensiones` de la parte técnica se aplana en campos con su unidad en el nombre, para que la validación sea simple.
*Alternativa:* un esquema JSON por categoría guardado en la base. Es más flexible, pero el Sprint 2 necesita estos nombres fijos de todos modos.

### D9. Stock con bloqueo optimista
`updateMany({ where: { productoId, version }, data: { cantidad, version: { increment: 1 } } })`. Si actualiza 0 filas, se lee el stock vigente y se responde 409 con la versión y la cantidad vigentes; si el producto no existe, 404. El `CHECK cantidad >= 0` de la base respalda la validación del DTO.

### D10. Catálogo público y `DisponibleService`
- `GET /productos` hace dos consultas, el `findMany` filtrado y paginado y el `count`, sobre la misma conexión de la petición. Filtra `activo = true` y `stock.cantidad > 0`.
- `DisponibleService` gana `disponibles(productoIds) → Map<id, number>`. Su implementación del Sprint 1, `DisponibleStockFisico`, reutiliza la cantidad que la consulta ya trajo y no hace otra consulta. El controlador siempre toma la disponibilidad del servicio.
- El precio se serializa como texto decimal (`"1299.90"`), para no perder precisión.
- El detalle de un producto activo agotado responde 200 con `disponible: 0` y `agotado: true`; el de uno inactivo, 404.

### D11. Semillas
Script `apps/api/scripts/semillas.mjs` en Node, con `pg` directo y la cadena `DIRECT_URL` (por defecto, el Postgres de Docker). El cliente de Prisma generado es para workerd y no carga en Node. Tiene tres partes idempotentes:
- **`categorias`:** `INSERT … ON CONFLICT (codigo) DO UPDATE`. Se ejecuta también en el job `desplegar`, después de las migraciones.
- **`catalogo`:** productos con UUID fijos y `ON CONFLICT (id) DO NOTHING`. Es manual, para local y para la demo.
- **`admin`:** lee `ADMIN_CORREO` y `ADMIN_CONTRASENA` del entorno, calcula el mismo formato PBKDF2 con `node:crypto` y hace un upsert por correo con rol ADMIN. Es manual, y esas variables nunca se versionan.

Una prueba de integración verifica que el hash generado en Node lo acepte la verificación del Worker.

### D12. Frontend
- **Rutas del App Router:** `/registro`, `/ingresar`, `/catalogo` (SSR, sin cookie: es público), `/catalogo/[id]` (SSR) y `/admin/catalogo` (cliente).
- **Peticiones con sesión:** las que llevan sesión se hacen desde el navegador con `credentials: 'include'`. `api.xdtech.store` es el mismo sitio que `xdtech.store`, así que la cookie `SameSite=Lax` viaja con ellas. No se reenvían cookies desde el render en servidor.
- **Cabecera:** consulta `GET /auth/me` en el cliente para mostrar la sesión y el enlace al panel.

### D13. Variables nuevas
En `wrangler.jsonc` (`vars`) y en `.dev.vars.example`:
- `LIMITE_REGISTRO_MAX=5` y `LIMITE_REGISTRO_VENTANA_MIN=60`;
- `LIMITE_LOGIN_CORREO_MAX=5`, `LIMITE_LOGIN_IP_MAX=50` y `LIMITE_LOGIN_VENTANA_MIN=15`.

Los valores por defecto viven en código y se validan al leerlos.

### D14. Pruebas e2e de navegador con Playwright (decidido por el desarrollador)
Las pruebas de integración ya cubren el comportamiento de la API. Las de Playwright cubren lo que falta: el código del frontend (formularios, cabecera de sesión y panel) en un navegador real, contra la API real.
- **Dónde viven:** `playwright.config.ts` en la raíz del repositorio y especificaciones en `tests/e2e/`, junto a `tests/k6/`. `@playwright/test` es una dependencia de desarrollo de la raíz, con Chromium.
- **Cómo se levantan:** el `webServer` de Playwright arranca dos procesos y espera a que respondan:
  - La API, con `wrangler dev` en el puerto 8787, contra el Postgres de Docker en local o el servicio de la CI. Hay que sobrescribir variables con `--var`: `FRONTEND_ORIGIN=http://localhost:3000`, `COOKIE_DOMAIN` vacío y límites altos. Sin `CF-Connecting-IP`, todas las peticiones comparten la clave `sin-ip`, y los límites de producción frenarían la propia suite. El estado de los Durable Objects va a un directorio temporal (`--persist-to`), para que los contadores no pasen de una corrida a otra.
  - El frontend, con `next build` + `next start` en el puerto 3000 y `NEXT_PUBLIC_API_URL=http://localhost:8787`. No se usa OpenNext porque su build falla en Windows; el build de OpenNext ya se verifica en el job `verificar`. `localhost:3000` y `localhost:8787` son el mismo sitio para el navegador, así que la cookie `SameSite=Lax` viaja con `credentials: 'include'`, igual que entre `xdtech.store` y `api.xdtech.store`.
- **Datos:** migraciones y semillas `categorias` y `catalogo`, más un administrador de prueba (`ADMIN_CORREO` y `ADMIN_CONTRASENA` fijados en el job, solo para la base efímera de la CI). Cada prueba crea sus propias cuentas con correos aleatorios.
- **CI:** un job `e2e`, paralelo a `verificar`, con el servicio Postgres e `playwright install --with-deps chromium`. `desplegar` depende de los dos. Si falla, sube el informe HTML como artefacto.
- **Producción:** las pruebas marcadas `@humo` son de solo lectura (catálogo, filtros, detalle y páginas de cuenta). Con `E2E_URL=https://xdtech.store` corren contra producción sin levantar servidores ni crear datos.

*Alternativas:* recorrer la aplicación a mano en cada sprint (no es repetible ni queda en la CI); levantar el frontend con OpenNext `preview` (más parecido a producción, pero no corre en Windows); Cypress (otra herramienta, sin ventaja aquí).

## Risks / Trade-offs

- [El inicio de sesión supera los 10 ms de CPU: PBKDF2 ~6,5 ms, más la base de la petición, más 1 conexión con SCRAM ~4 ms] → Medirlo en producción con `wrangler tail` (tarea específica) y registrarlo. Si pasa de forma sostenida, las opciones son bajar las iteraciones o aceptar la ráfaga, porque el plan gratuito no corta al primer exceso, como se vio en el Sprint 0. Lo decide el desarrollador con el número en la mano.
- [Una conexión compartida dentro de la petición encola consultas paralelas] → Las rutas de este sprint son secuenciales. Queda documentado en `conPrisma()`.
- [La conexión de una petición no se cierra si la respuesta nunca emite `close`] → La conexión se cierra al terminar la invocación del Worker de todos modos. Además, la prueba de integración de 60 peticiones concurrentes se amplía para verificar que no queden conexiones abiertas (`pg_stat_activity`).
- [Las filas escritas por los contadores se suman a las de `Inventario` en la cuota de 100.000 por día] → 1 o 2 filas por intento; las pruebas de límites corren en local.
- [En el Sprint 3, el disponible vendrá del almacén y no de SQL, así que filtrar en SQL "disponible > 0" con paginación dejará de ser exacto] → `DisponibleService.disponibles()` ya es el único origen del valor mostrado. El Sprint 3 debe decidir cómo filtrar (por ejemplo, que el almacén mantenga la lista de agotados). Se deja anotado allí.
- [Enumeración de cuentas por el registro, que responde 409 a un correo existente] → Lo exige la HU-01 ("mensaje claro"). Lo mitiga el límite por IP.
- [Las pruebas de Playwright suman unos minutos a la CI (build de Next e instalación de Chromium)] → Corren en un job paralelo a `verificar`, con la caché de pnpm.
- [El administrador inicial depende de un paso manual] → Está documentado en el README del API con el comando exacto. La semilla es idempotente.

## Migration Plan

1. La migración `revocada_en` se aplica en el job `desplegar`, antes de desplegar el Worker, como cualquier migración. Es aditiva y no rompe la versión anterior.
2. La semilla de categorías corre en `desplegar` después de las migraciones.
3. El desarrollador ejecuta una vez contra Neon las semillas `admin` (con sus credenciales en el entorno) y `catalogo`.
4. Antes de este cambio se retira `PROTOTIPO_TOKEN` del Worker, con `wrangler secret delete`, ejecutado por el desarrollador.

Rollback: `wrangler rollback` del Worker. La columna nueva admite nulos, así que la versión anterior sigue funcionando.

## Open Questions

- Ninguna que cambie el plan. Las iteraciones de PBKDF2 quedan en 50.000 (spec `autenticacion`). Si la medición del inicio de sesión aconseja otro valor, se cambia en un cambio aparte: el formato guarda las iteraciones, así que las cuentas existentes siguen verificando.
