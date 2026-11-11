# Tasks

## 0. Prerrequisitos externos (los hace el desarrollador, fuera del código)

- [x] 0.1 Confirmar que `xdtech.store` está comprado y su DNS administrado en Cloudflare; se verifica con `dig NS xdtech.store`, que debe devolver servidores de Cloudflare
- [x] 0.2 Crear las cuentas de Neon y GitHub y el proyecto de Neon; se verifica con la cadena de conexión **directa** de Neon disponible (la usan Hyperdrive y las migraciones)
- [x] 0.3 Ejecutar `wrangler login`; se verifica con `wrangler whoami`, que debe mostrar la cuenta
- [x] 0.4 Responder las decisiones pendientes P1–P3 y P6–P8 de design.md (o aceptar las recomendadas); se verifica con la tabla de design.md actualizada

## 1. Repositorio y monorepo

- [x] 1.1 Inicializar Git con rama `main`, `.gitignore` (node_modules, `.dev.vars`, `.env`, `.wrangler`, `.open-next`, builds) y remoto **público** en GitHub; antes del primer push, revisar con `git ls-files` que no se incluya ningún secreto; se verifica con `git status` limpio y el primer push visible en GitHub
- [x] 1.2 Crear `package.json` raíz y `pnpm-workspace.yaml` con `apps/*`, fijar Node 24 (`.nvmrc`, `engines` y `setup-node` en la CI) y configurar TypeScript estricto compartido (`tsconfig.base.json`); se verifica con `pnpm install` sin errores
- [x] 1.3 Configurar ESLint y Prettier compartidos con scripts `lint` y `format` en la raíz; se verifica con `pnpm lint` en verde sobre el repo vacío
- [x] 1.4 Crear la estructura de carpetas de la sección 3 de la parte técnica (`apps/api/src/{auth,catalogo,...,health}`, `apps/api/prisma`, `tests/k6`, `docs/`); se verifica comparando el árbol con esa sección

## 2. API en Workers (NestJS)

- [x] 2.1 Crear `apps/api` con NestJS (adaptador Express), Wrangler como dependencia de desarrollo y Vitest con `@cloudflare/vitest-pool-workers`; se verifica con `pnpm --filter api test`, que corre una prueba de ejemplo
- [x] 2.2 Crear `wrangler.jsonc` con nombre, `main: src/worker.ts`, `compatibility_date` ≥ `2026-08-04`, los tres crons de D3, los bindings de Durable Object `INVENTARIO` y `LIMITES` (con la migración `new_sqlite_classes`) y las variables `COOKIE_DOMAIN`, `FRONTEND_ORIGIN` y `SESSION_TTL_DAYS`; se verifica con `wrangler deploy --dry-run` sin errores
- [x] 2.3 Implementar `src/worker.ts` con la inicialización perezosa de NestJS por instancia y `httpServerHandler` (D2), exportando `{ fetch, scheduled }` y las clases de los Durable Objects; se verifica con `wrangler dev` respondiendo a una ruta de prueba
- [x] 2.4 Implementar el despacho de `scheduled` por expresión cron, con tareas `expirar`, `reconciliar` y `limpiarSesiones` que solo registran su nombre y una advertencia para crons desconocidos (spec `tareas-programadas`); se verifica con pruebas unitarias de cada caso y con otra que compara el mapa con `wrangler.jsonc`
- [x] 2.5 Configurar CORS con credenciales solo para `FRONTEND_ORIGIN` y el formato de error `{ codigo, mensaje }` con un filtro global; se verifica con una prueba e2e en la que un origen ajeno no recibe `Access-Control-Allow-Origin`

## 3. Base de datos (Neon por Hyperdrive)

- [x] 3.1 Crear `docker-compose.yml` con Postgres local; se verifica con `docker compose up -d` y el servicio en `healthy`
- [x] 3.2 Crear la configuración de Hyperdrive con `wrangler hyperdrive create` (cadena directa de Neon, **caché desactivado**), agregar el binding `HYPERDRIVE` a `wrangler.jsonc` con `localConnectionString` hacia el Postgres de Docker, y configurar Prisma con `@prisma/adapter-pg` sobre `env.HYPERDRIVE.connectionString` (D4); se verifica con `wrangler hyperdrive get` mostrando el caché desactivado y un `SELECT 1` desde `wrangler dev`
- [x] 3.3 Escribir `schema.prisma` con el modelo completo y las restricciones de D11 (spec `esquema-datos`), sin `tokens_recuperacion`, y generar la migración inicial; se verifica con `prisma migrate dev` aplicándose en local
- [x] 3.4 Escribir pruebas de integración de las restricciones: correo único sin distinguir mayúsculas, stock no negativo, un stock por producto, clave de idempotencia única, enums inválidos rechazados y `carrito_items` con exactamente un destino; se verifica con `pnpm --filter api test:int` en verde
- [x] 3.5 Aplicar la migración en Neon con `prisma migrate deploy` y la cadena directa (`DIRECT_URL`); se verifica con `prisma migrate status` contra Neon sin migraciones pendientes

## 4. Salud

- [x] 4.1 Definir el puerto `DisponibleService` con `ping()`, implementado sobre el método `consultar` del Durable Object `Inventario` (D6); se verifica con una prueba en el pool de Workers en la que `ping()` responde
- [x] 4.2 Implementar `GET /health/live` sin dependencias y `GET /health/ready` con un tiempo de espera por dependencia y 503 que indica la dependencia caída sin exponer detalles (spec `salud-api`); se verifica con pruebas e2e de los cuatro escenarios (Postgres apagado con `docker compose stop`; almacén caído simulado con un stub del binding que falla)

## 5. Frontend

- [x] 5.1 Crear `apps/web` con Next.js y `@opennextjs/cloudflare`, una página con SSR y la URL pública de la API en una variable de compilación; se verifica con `pnpm --filter web preview`, que la sirve en local
- [x] 5.2 Configurar `wrangler.jsonc` del frontend; se verifica con `wrangler deploy` que publica la página en un subdominio `*.workers.dev`

## 6. Entrega continua y dominios

- [x] 6.1 Crear `.env.example` y `apps/api/.dev.vars.example` con todas las variables (incluidas `COOKIE_DOMAIN`, `FRONTEND_ORIGIN`, `SESSION_TTL_DAYS`, `HEALTH_TIMEOUT_MS`, `DIRECT_URL` y la cadena local de Hyperdrive); se verifica clonando en limpio, copiando los ejemplos y levantando `wrangler dev` sin variables faltantes
- [x] 6.2 Crear `.github/workflows/ci.yml` con el job `verificar` (install, lint, unit, integración con el servicio Postgres, build) en cada push y PR; se verifica con un push que deja la ejecución en verde y otro con una prueba rota que la deja en rojo
- [x] 6.3 Crear un API token de Cloudflare para la CI y agregar el job `desplegar` solo en `main`: migraciones con `NEON_DIRECT_URL` y después `wrangler deploy` de la API y del frontend, con los secretos `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` y `NEON_DIRECT_URL` en GitHub; se verifica con una fusión en `main` que despliega, y con un push a otra rama que no despliega
- [x] 6.4 Confirmar que el Worker no necesita secretos de base de datos (la cadena vive en la configuración de Hyperdrive) y cargar con `wrangler secret put` solo los que sí hagan falta; se verifica con `wrangler secret list` y con una búsqueda en el repositorio que no encuentra ninguna cadena de conexión
- [x] 6.5 Configurar los Custom Domains `api.xdtech.store` y el del frontend (P3); se verifica con `curl -I https://api.xdtech.store/health/live` devolviendo 200 con un certificado válido y el frontend cargando por HTTPS

## 7. Pruebas de compatibilidad (HU-36b)

- [x] 7.1 Crear `docs/compatibilidad-cloudflare.md` con la tabla de las nueve pruebas (prueba, resultado, medidas, decisión) y una sección de decisiones que ya registre Node 24, Hyperdrive y la opción B como decisiones del desarrollador; se verifica con el archivo en el repositorio y las nueve filas presentes
- [x] 7.2 Prueba 1: medir el tamaño del bundle (comprimido y sin comprimir, con Prisma incluido), el arranque en frío y la CPU por petición de NestJS desplegado; se verifica con los números registrados y una decisión NestJS/Hono
- [x] 7.3 Prueba 2: confirmar la página SSR y el `fetch` con credenciales del frontend desplegado; se verifica con el resultado registrado y una decisión Cloudflare/Vercel
- [ ] 7.4 Prueba 3: medir la latencia de Prisma con Neon a través de Hyperdrive desde el Worker desplegado, con la base suspendida (más de 5 min sin uso) y despierta, los subrequests por consulta y que una escritura se lee de inmediato (caché desactivado); reconfirmar los límites de Hyperdrive en el plan gratuito; se verifica con los números registrados (si falla, se prueba `@prisma/adapter-neon` y se registra)
- [x] 7.5 Prueba 4: prototipo del Durable Object `Inventario` con SQLite (`reservar` todo o nada, `expirar`, `consultar`, caso "no inicializado"), con pruebas en el pool de Workers; se verifica con las pruebas en verde
- [ ] 7.6 Escribir `tests/prototipos/reservas-300.ts` y correrlo contra `wrangler dev` (repetible) y una vez contra producción (latencia real); se verifica con exactamente 5 reservas exitosas y disponible 0, y con la latencia p50/p95, las filas escritas por reserva y su proyección diaria registradas
- [ ] 7.7 Registrar la confirmación de la opción B con la regla de la sección 5.3 (filas escritas proyectadas frente a la cuota diaria, latencia, motivo); **solo si B falla**, prototipar la opción A con Upstash, correr las mismas pruebas y registrar la decisión final; se verifica con la sección de decisiones completa
- [ ] 7.8 Prueba 5: medir la CPU de PBKDF2-SHA256 con varias cantidades de iteraciones en el Worker desplegado y elegir los parámetros (D7, P7); se verifica con la tabla iteraciones → ms registrada y el valor elegido por debajo de 10 ms
- [ ] 7.9 Prueba 6: endpoint temporal que emite la cookie `Domain=.xdtech.store` y página del frontend que la devuelve con credenciales; probar en Chrome y en Safari o Firefox (manual); se verifica con el resultado por navegador registrado
- [x] 7.10 Prueba 7: endpoint temporal que devuelve `CF-Connecting-IP` y la IP del socket desde `api.xdtech.store`; se verifica con el registro que muestra la IP pública correcta y que la del socket no sirve
- [x] 7.11 Prueba 8: disparar `scheduled` en local (`wrangler dev --test-scheduled` y `/__scheduled?cron=...`) y comprobar las ejecuciones en producción con `wrangler tail`; se verifica con el registro de las tres tareas en local y de al menos la de cada minuto en producción
- [ ] 7.12 Prueba 9: contar los subrequests de una reserva de ejemplo (llamada al Durable Object y registro en Postgres por Hyperdrive); se verifica con un número registrado muy por debajo de 50

## 8. Cierre del sprint

- [ ] 8.1 Eliminar los endpoints temporales de cookie e IP (y el prototipo de Upstash, si llegó a hacerse y se descartó); se verifica con 404 en esas rutas en la versión desplegada y la CI en verde
- [ ] 8.2 Actualizar `docs/00_parte_tecnica.md`, `docs/01_arquitectura_despliegue.md` y los sprints afectados (0, 1, 3, 6 y 7) con Hyperdrive, la opción B y cualquier otro plan B elegido, y quitar del `context` de `openspec/config.yaml` las decisiones que ya estén en docs/; se verifica con una búsqueda de `Upstash` y `adapter-neon` sin referencias vigentes
- [ ] 8.3 Verificar la definición de hecho del Sprint 0: Worker en `api.xdtech.store`, frontend en su dominio, CI en verde con despliegue automático, esquema migrado en Neon, nueve pruebas registradas y decisión del almacén registrada; se verifica recorriendo la lista contra el entorno desplegado

## Workflow follow-up

- Archivar el cambio con `/opsx:archive` cuando la definición de hecho esté verificada.
- Proponer el Sprint 1 (`sprint_01_usuarios_catalogo.md`) a partir de las decisiones registradas.
