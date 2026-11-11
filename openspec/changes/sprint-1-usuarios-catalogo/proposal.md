# Proposal

## Why

El Sprint 0 dejó la plataforma validada y desplegada: Worker en `api.xdtech.store`, frontend en `xdtech.store`, esquema migrado en Neon y nueve pruebas en OK. Todavía no existe ninguna función de negocio. El Sprint 1 (`docs/sprint_01_usuarios_catalogo.md`) agrega lo que necesitan todos los sprints siguientes: cuentas con sesión y roles, y un catálogo administrable con stock visible.

Además, el Sprint 0 dejó hallazgos que conviene resolver antes de construir encima. El más importante es de costo: cada `conPrisma()` abre una conexión nueva, y cada conexión paga una autenticación SCRAM (~4 ms de CPU) y consume cuota de Hyperdrive. Con tres conexiones, una petición ya pasó los 10 ms. Un inicio de sesión, que también hace PBKDF2 (~6,5 ms), quedaría lejos del límite si cada consulta abre su propia conexión.

## What Changes

**Historias del Sprint 1**
- **HU-01 Registro:** `POST /auth/registro` con validación de correo y contraseña, rol CLIENTE y hash PBKDF2-SHA256 de 50.000 iteraciones (`pbkdf2$<iteraciones>$<sal>$<hash>`), con límite por IP.
- **HU-02 Sesión:** `POST /auth/login`, `POST /auth/logout` y `GET /auth/me`. La sesión es un token opaco en una cookie `httpOnly; Secure; SameSite=Lax; Domain=.xdtech.store` (sin `Domain` ni `Secure` en local), válida 7 días, y en Postgres solo se guarda su hash. Ante credenciales incorrectas, el error es genérico. Hay límites por correo (solo cuentan los intentos fallidos) y por IP. Las sesiones vencidas y revocadas se borran con el cron diario y al iniciar sesión.
- **HU-03:** sigue diferida. No se crea nada.
- **HU-04 Roles:** decorador `@Roles()` y una guarda que responde 401 sin sesión y 403 con un rol insuficiente. Una semilla crea el primer administrador.
- **HU-05 y HU-06 Catálogo administrable:** alta y edición de productos y equipos armados, con atributos técnicos validados por categoría. La actualización de stock usa bloqueo optimista por `version`. Semillas de categorías y de un catálogo de ejemplo.
- **HU-07 y HU-08 Catálogo público:** `GET /productos`, con filtros por categoría y rango de precio y con paginación, y `GET /productos/:id`, que muestran la disponibilidad. Los productos sin disponible no se presentan como disponibles. La disponibilidad se obtiene a través de `DisponibleService`, que por ahora devuelve el stock físico.
- **Pantallas:** registro, inicio de sesión, catálogo, detalle de producto y panel básico de administración del catálogo.

**Correcciones derivadas del Sprint 0**
- **Una conexión a Postgres por petición HTTP**, no una por cada llamada a `conPrisma()`: todas las consultas de una petición comparten una conexión, que se cierra al terminar la petición.
- **Límites de peticiones en el Durable Object `Limites`**, que hoy solo responde `ping`. Las IPv6 se agrupan por prefijo /64, porque en producción llegaron direcciones IPv6.
- **CPU del inicio de sesión medida en producción** con `wrangler tail` y registrada, por ser la primera ruta que combina PBKDF2 con consultas.
- **Spec `validacion-plataforma`:** se corrige el requisito de IP. La IP del socket coincidió con `CF-Connecting-IP`, así que lo que se documenta es que no se usa por no estar documentada, no que "no sea válida".
- **Tarea `limpiarSesiones`:** deja de ser vacía (spec `tareas-programadas`).
- **Mantenimiento:** subir `wrangler` y `@cloudflare/vitest-plugin`, que quedaron retenidos por la antigüedad mínima de pnpm, y retirar el secreto temporal `PROTOTIPO_TOKEN` del Worker.

Fuera de este cambio: el disponible real del Durable Object `Inventario`, las reservas y el carrito (Sprint 3), el motor de reglas (Sprint 2) y la recuperación de contraseña (HU-03, diferida).

## Capabilities

### New Capabilities

- `autenticacion`: registro de cuentas, hash de contraseñas, sesión por cookie guardada como hash en Postgres, inicio y cierre de sesión, consulta del usuario actual y ciclo de vida de las sesiones.
- `limite-peticiones`: contadores de intentos de registro (por IP) e inicio de sesión (por correo y por IP) en el Durable Object `Limites`, obtención de la IP del cliente y agrupación IPv6 por /64.
- `autorizacion-roles`: protección de endpoints por sesión y por rol (CLIENTE y ADMIN) y creación del primer administrador.
- `catalogo`: categorías, productos y equipos armados con atributos técnicos validados por categoría, stock con bloqueo optimista, y catálogo público con filtros, paginación y disponibilidad.

### Modified Capabilities

- `tareas-programadas`: la limpieza diaria de sesiones pasa a tener lógica real. Borra las sesiones vencidas y las revocadas con más de un día.
- `validacion-plataforma`: el requisito "IP real del cliente" se ajusta al resultado medido, porque la IP del socket coincidió con `CF-Connecting-IP`.
- `esquema-datos`: la tabla de sesiones guarda además la fecha de revocación. Sin ella, la limpieza no puede distinguir las revocadas hace más de un día.

## Impact

- **API (`apps/api`):** módulos nuevos `auth/` (registro, sesión, guardas, roles, `Limites`) y `catalogo/`. `datos/prisma.ts` pasa a una conexión por petición, con un middleware que abre el contexto. `reservas/disponible.service.ts` suma la consulta de disponible. `programadas/` implementa `limpiarSesiones`. Se agrega un script de semillas.
- **Base de datos:** una migración pequeña agrega `sesiones.revocada_en` (fecha de revocación, admite nulos). Las demás tablas que se usan (`usuarios`, `categorias`, `productos` y `stock`) ya existen. Las semillas cargan datos.
- **Frontend (`apps/web`):** páginas nuevas de cuenta, catálogo y administración, con `fetch` con credenciales a la API.
- **Pruebas:** pruebas e2e de navegador con Playwright (`@playwright/test`, dependencia de desarrollo de la raíz) en `tests/e2e/`, y un job `e2e` en la CI del que depende el despliegue (design D14).
- **Configuración:** variables nuevas de límites (`LIMITE_REGISTRO_*`, `LIMITE_LOGIN_*`) en `wrangler.jsonc` y `.dev.vars.example`. Credenciales del administrador inicial, solo para el script de semillas y fuera del repositorio.
- **Cuotas:** consultas de Hyperdrive (100.000 por día) y CPU por petición (10 ms). La conexión por petición y las consultas agrupadas del catálogo apuntan a ambas.
- **Specs:** 4 capacidades nuevas y 3 modificadas.
