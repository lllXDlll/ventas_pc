# Sprint 1: Usuarios y catálogo (semana 2)

> Contexto previo: `00_parte_tecnica.md`. Implementa solo lo de este documento.

**Objetivo:** autenticación completa con roles y catálogo administrable con stock visible.
**Depende de:** Sprint 0 (repositorio, esquema migrado, CI).

## HU-01 Registro de usuario
**Como** visitante, **quiero** registrarme con correo y contraseña, **para** poder armar configuraciones y comprar.

**Criterios de aceptación**
- Dado un correo no registrado y contraseña válida, se crea la cuenta con rol CLIENTE.
- Dado un correo ya registrado, se rechaza con mensaje claro.
- Contraseña con hash robusto; validación de formato de correo y longitud mínima.
- Límite de peticiones por IP en el registro (5 por hora, configurable); al excederlo, 429 con mensaje claro.

**Tareas:** `POST /auth/registro`, DTO con validación, servicio de hash (sin binarios nativos, ver sección 6 de `00_parte_tecnica.md`), límite por IP leyendo `CF-Connecting-IP`, con contadores en el Durable Object `Limites` (ver sección 2.2 de `00_parte_tecnica.md`), agrupando las IP IPv6 por prefijo /64, pruebas unitarias y e2e, pantalla de registro.

## HU-02 Inicio y cierre de sesión
**Como** usuario registrado, **quiero** iniciar y cerrar sesión, **para** acceder de forma segura.

**Criterios de aceptación**
- Credenciales correctas crean una sesión y la API responde con una cookie `httpOnly; Secure; SameSite=Lax; Domain=.xdtech.store` (sin `Domain` ni `Secure` en desarrollo local) con vencimiento de 7 días.
- Credenciales incorrectas devuelven error genérico (no revela cuál dato falló).
- Cerrar sesión marca la sesión como revocada y borra la cookie; una petición posterior con esa cookie recibe 401.
- Una sesión vencida o revocada recibe 401.
- Límite de peticiones en el inicio de sesión: por correo (5 intentos fallidos por 15 min) y por IP, más holgado; al excederlo, 429.
- Las sesiones vencidas o revocadas se eliminan: tarea diaria y limpieza de las del propio usuario al iniciar sesión. Una sesión vencida o revocada se rechaza aunque no se haya borrado todavía.

**Tareas:** `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, uso de la tabla `sesiones` (guardar solo el hash del token), guarda de autenticación que lee la cookie, CORS con credenciales solo para el origen del frontend, límite por correo y por IP con contadores en el Durable Object `Limites` (el contador por correo solo aumenta en los intentos fallidos y se borra al acertar), IP leída de `CF-Connecting-IP` (no usar `req.ip` ni `trust proxy`), limpieza diaria de sesiones con un Cron Trigger de Cloudflare (handler `scheduled`) y limpieza al iniciar sesión, pantallas.
*Nota:* no usar JWT. Ver sección 2.2 de `00_parte_tecnica.md`.

## HU-03 Recuperación de acceso: DIFERIDA
Esta historia **no se implementa** en este proyecto. Queda como mejora futura; la justificación y el diseño sugerido están en la sección 10 de `00_parte_tecnica.md`. No crear endpoints, tablas ni integración de correo para ella. La numeración de las demás historias no cambia.

## HU-04 Permisos por rol
**Como** administrador, **quiero** que las funciones administrativas sean solo para mi rol, **para** proteger el sistema.

**Criterios de aceptación**
- Un cliente en un endpoint administrativo recibe 403.
- Un administrador accede al panel.

**Tareas:** decorador `@Roles()` y guarda de roles, semilla con un usuario administrador, pruebas de acceso.

## HU-05 Registro de productos y equipos armados
**Como** administrador, **quiero** registrar componentes y equipos con atributos técnicos, **para** habilitar la validación de compatibilidad.

**Criterios de aceptación**
- Crear producto con nombre, categoría, tipo, precio, stock inicial y atributos técnicos por categoría.
- Validar campos obligatorios según la categoría.
- Un equipo armado es un producto propio con su stock.

**Tareas:** CRUD en `catalogo/`, esquemas de validación de atributos por categoría, semillas con un catálogo de ejemplo (varios sockets, tipos de RAM, fuentes, gabinetes), panel básico de catálogo.

## HU-06 Actualización de precios, stock y atributos
**Como** administrador, **quiero** actualizar precio, stock y atributos, **para** mantener el catálogo vigente.

**Criterios de aceptación**
- Los cambios se guardan y se reflejan en el catálogo.
- La actualización de stock valida `version`; si es obsoleta, se rechaza con aviso.

**Tareas:** `PATCH /admin/productos/:id`, `PATCH /admin/stock/:productoId` con bloqueo optimista, pruebas de conflicto de versión.
*Nota:* el catálogo todavía no lee el disponible del Durable Object `Inventario`. Usar el punto de extensión `DisponibleService`, que se completa en el Sprint 3 (por ahora devuelve el stock físico).

## HU-07 Exploración del catálogo con stock real
**Como** cliente, **quiero** explorar el catálogo y ver la disponibilidad, **para** decidir sin sorpresas.

**Criterios de aceptación**
- Filtro por categoría y rango de precio.
- Cada producto muestra disponibilidad y atributos técnicos relevantes.

**Tareas:** `GET /productos` con filtros y paginación, `GET /productos/:id`, pantallas de catálogo y detalle.

## HU-08 Ocultar productos sin stock
**Como** cliente, **quiero** que los agotados no aparezcan como disponibles, **para** no intentar comprarlos.

**Criterios de aceptación**
- Disponible igual a cero no se presenta como disponible.
- Si vuelve a haber disponible, reaparece.

**Tareas:** filtro por disponible en la consulta del catálogo, pruebas.

## Definición de hecho del sprint
Auth completa con roles, CRUD de catálogo, catálogo público con filtros, pruebas pasando.
