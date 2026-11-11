# Tasks

## 0. Correcciones y mantenimiento heredados del Sprint 0

- [ ] 0.1 Retirar el secreto temporal con `npx wrangler secret delete PROTOTIPO_TOKEN` (lo hace el desarrollador) y quitar la línea de su `.dev.vars`; se verifica con `wrangler secret list`, que devuelve `[]`
- [ ] 0.2 Subir `wrangler` y `@cloudflare/vitest-plugin` a su última versión estable sin excepciones de `minimumReleaseAge` en `pnpm-workspace.yaml`; se verifica con `pnpm outdated -r`, que no los lista, y con la CI en verde
- [ ] 0.3 Una conexión a Postgres por petición HTTP (design D1): un contexto por petición en el servidor de `worker.ts`, reutilizado por `conPrisma()` y cerrado en el `close` de la respuesta; ampliar la prueba de integración de 60 peticiones concurrentes para comprobar que no quedan conexiones abiertas (`pg_stat_activity`) y agregar una prueba de que dos `conPrisma()` dentro de una petición comparten la conexión (mismo `pg_backend_pid()`); se verifica con `pnpm --filter api test:int` en verde

## 1. Esquema y semillas

- [x] 1.1 Migración nueva que agrega `sesiones.revocada_en timestamptz NULL` (design D4) y su campo en `schema.prisma`; se verifica con `prisma migrate dev` en local y con una prueba de integración que lee la columna
- [x] 1.2 Script `scripts/semillas.mjs` con las partes `categorias`, `catalogo` y `admin` (design D11), idempotentes y con `pg` sobre `DIRECT_URL`; agregar los scripts `semilla:*` a `package.json`; se verifica con una prueba de integración que ejecuta cada parte dos veces y compara los conteos
- [x] 1.3 Catálogo de ejemplo con al menos dos sockets, dos tipos de RAM, fuentes de distinta potencia, gabinetes de distinto factor de forma y un equipo armado, con atributos válidos según la tabla D8; se verifica con la prueba de integración de 1.2 y con el validador de atributos de 4.1 aplicado a cada producto de la semilla
- [ ] 1.4 Ejecutar la semilla `categorias` en el job `desplegar`, después de las migraciones, y documentar en `apps/api/README.md` cómo ejecutar `admin` y `catalogo` contra Neon; se verifica con la CI en verde y con `GET /categorias` en producción devolviendo las ocho categorías

## 2. Límites de peticiones

- [x] 2.1 Función pura de clave de IP (design D6: IPv4, IPv6 a /64, `::ffff:` como IPv4 y `sin-ip`); se verifica con pruebas unitarias de cada caso de la spec `limite-peticiones`
- [x] 2.2 Métodos `consumir`, `consultar`, `registrarFallo` y `reiniciar` del Durable Object `Limites` con SQLite y ventana fija (design D5); se verifica con pruebas en el pool de Workers: límite exacto, vencimiento de la ventana y 10 llamadas concurrentes con máximo 5 que dan exactamente 5 permitidas
- [x] 2.3 Servicio de límites con la lectura y validación de `LIMITE_*` (design D13) y la respuesta 429 con `DEMASIADAS_PETICIONES` y `Retry-After`; agregar las variables a `wrangler.jsonc` y `.dev.vars.example`; se verifica con pruebas unitarias de la configuración por defecto y de un valor configurado

## 3. Autenticación y roles

- [x] 3.1 Servicio de contraseñas con PBKDF2-SHA256, 50.000 iteraciones, el formato `pbkdf2$…`, comparación en tiempo constante y el hash ficticio para correos inexistentes (design D2); se verifica con pruebas unitarias (formato, verificación con otras iteraciones, contraseña incorrecta) y con la prueba de integración de 1.2 que verifica el hash generado en Node
- [ ] 3.2 `POST /auth/registro` con DTO (correo, contraseña de 8 o más caracteres), 201, 409 por correo repetido sin distinguir mayúsculas y límite por IP; se verifica con pruebas e2e de los escenarios de la spec `autenticacion` (registro) y del límite de registro
- [ ] 3.3 Sesiones (design D3): `POST /auth/login` con cookie y atributos según `COOKIE_DOMAIN`, error genérico 401 (correo inexistente, contraseña incorrecta y cuenta bloqueada), límites por correo y por IP, y limpieza de las sesiones vencidas o revocadas del usuario al iniciar sesión; se verifica con pruebas e2e de cada escenario de inicio de sesión, del límite por correo (incluido el reinicio al acertar) y del límite por IP
- [ ] 3.4 Guarda global con `@RequiereSesion()`, `@Roles()` y `@UsuarioActual()` (design D7), `GET /auth/me` y `POST /auth/logout` (revocada y `revocada_en`, cookie vencida); se verifica con pruebas e2e: sin cookie 401, token desconocido 401, sesión vencida 401, sesión revocada 401, cuenta bloqueada 401 y `me` correcto
- [ ] 3.5 Prueba e2e que recorre todas las rutas `/admin` registradas y comprueba 401 sin sesión y 403 con rol CLIENTE (design D7); se verifica haciéndola fallar con una ruta `/admin` temporal sin `@Roles` y viéndola pasar al quitarla
- [ ] 3.6 Implementar `limpiarSesiones` en el despacho del cron (spec `tareas-programadas`), con el registro del número de sesiones borradas y la captura de errores de la base; se verifica con una prueba de integración de los cuatro tipos de sesión del escenario y con otra de fallo de Postgres

## 4. Catálogo

- [x] 4.1 Validador puro de atributos por categoría con la tabla de design D8 y la coherencia entre tipo y categoría; se verifica con pruebas unitarias por categoría (atributo ausente, tipo inválido, atributos adicionales aceptados)
- [ ] 4.2 `GET /categorias`, `POST /admin/productos` (producto y stock en una transacción, versión 0) y `PATCH /admin/productos/:id`, con `GET /admin/productos` para el panel; se verifica con pruebas e2e de los escenarios de alta y actualización de la spec `catalogo`
- [ ] 4.3 `PATCH /admin/stock/:productoId` con bloqueo optimista (design D9): 200 con la versión aumentada, 409 con la versión y la cantidad vigentes, 400 para una cantidad negativa y 404 para un producto inexistente; se verifica con una prueba de integración de dos actualizaciones con la misma versión, en la que una gana y otra recibe 409
- [ ] 4.4 `DisponibleService.disponibles(ids)` con la implementación `DisponibleStockFisico` (design D10), sin consultas extra; se verifica con una prueba unitaria y con un e2e en el que la disponibilidad del catálogo es igual al stock físico
- [ ] 4.5 `GET /productos` (filtros por categoría y precio, paginación con 20 por defecto y 100 como máximo, total y precio como texto) y `GET /productos/:id` (agotado visible y 404 si está inactivo); se verifica con pruebas e2e de filtros, de la página 3 con 45 resultados, de los parámetros inválidos, del producto agotado que desaparece del listado y de su reaparición tras reponer stock

## 5. Frontend

- [ ] 5.1 Cliente de la API con `credentials: 'include'` y manejo de `{ codigo, mensaje }`, y una cabecera con el estado de la sesión (`GET /auth/me`), el enlace al panel para ADMIN y el botón de cerrar sesión; se verifica con `pnpm --filter web typecheck` y con un registro, inicio y cierre de sesión manual en `wrangler dev`
- [ ] 5.2 Páginas `/registro` e `/ingresar` que muestran los mensajes de error de la API (incluidos el 409 y el 429); se verifica de forma manual en local con un registro exitoso, un correo repetido y un inicio de sesión fallido
- [ ] 5.3 Páginas `/catalogo` (SSR con filtros por categoría y precio y paginación) y `/catalogo/[id]` (atributos, disponibilidad y aviso de agotado); se verifica con el build de OpenNext en la CI y de forma manual en local con la semilla del catálogo cargada
- [ ] 5.4 Panel `/admin/catalogo`: listado, alta de producto con atributos por categoría, edición de precio, estado y atributos, y stock con aviso de conflicto de versión y cantidad vigente; acceso denegado para CLIENTE; se verifica de forma manual en local con un ADMIN, con un conflicto provocado desde dos pestañas y con un CLIENTE que ve el aviso de acceso

## 6. Despliegue y verificación en producción

- [ ] 6.1 Desplegar en `main` (CI en verde con la migración y la semilla de categorías), ejecutar las semillas `admin` y `catalogo` contra Neon y recorrer en `https://xdtech.store` el registro, el inicio de sesión, el catálogo con filtros, el panel como ADMIN y el cierre de sesión; se verifica con cada paso funcionando en Chrome y con la cookie `Domain=.xdtech.store` presente
- [ ] 6.2 Medir con `wrangler tail` la CPU de `POST /auth/login` (acierto y fallo), `POST /auth/registro`, `GET /auth/me` y `GET /productos` en producción, y registrar los números y las conexiones por petición en `docs/compatibilidad-cloudflare.md`; se verifica con la sección de mediciones del Sprint 1 escrita y con la decisión sobre las iteraciones de PBKDF2 tomada por el desarrollador
- [ ] 6.3 Actualizar `docs/00_parte_tecnica.md` y `docs/01_arquitectura_despliegue.md` con la conexión por petición, `revocada_en`, el nombre de la cookie, los atributos por categoría (tabla D8) y las variables `LIMITE_*`; se verifica con una búsqueda de cada concepto en `docs/`

## Workflow follow-up

- Archivar el cambio con `/opsx:archive` cuando la definición de hecho del Sprint 1 esté verificada.
- Proponer el Sprint 2 (`sprint_02_motor_reglas.md`) usando los nombres de atributos fijados en D8.
