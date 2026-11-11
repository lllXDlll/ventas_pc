# Sprint 0: Fundamentos y validación de compatibilidad con Cloudflare (semana 1)

> Contexto previo: `00_parte_tecnica.md` (en especial las secciones 2, 5.3 y 6). Implementa solo lo de este documento.

**Objetivo:** entornos conectados, despliegue vacío funcionando en Cloudflare, esquema inicial migrado y compatibilidades comprobadas con Wrangler, incluida la decisión sobre el caché de concurrencia.
**Depende de:** nada.
**Prerrequisito (fuera del código):** el dominio `xdtech.store` comprado y su DNS administrado en Cloudflare; cuentas de Cloudflare, Neon y GitHub; el CLI Wrangler autenticado (`wrangler login`). La cuenta de Upstash se crea solo para evaluar la opción A del caché, y la de Vercel solo si el frontend necesita el plan B. El dominio es el único elemento del proyecto que no es gratuito.

## HU-36a Base técnica y despliegue vacío
**Como** desarrollador, **quiero** el repositorio, la CI y los servicios conectados, **para** empezar a construir sobre una base estable.

**Tareas**
- Crear monorepo con `apps/web` (Next.js) y `apps/api` (NestJS).
- Configurar Wrangler en `apps/api`: `wrangler.jsonc` con nombre, `main: src/worker.ts`, `compatibility_date` igual o posterior a `2026-08-04`, Cron Triggers (expiración cada minuto, reconciliación cada 5 minutos y limpieza diaria de sesiones) y variables no secretas.
- Crear `src/worker.ts`: inicializa NestJS (adaptador Express) una vez por instancia, enruta las peticiones con `httpServerHandler` de `cloudflare:node` y exporta el handler `scheduled` junto al `fetch`. Ver sección 2.0.1 de `00_parte_tecnica.md`.
- Configurar el despliegue del frontend en Cloudflare con Wrangler (ver prueba 2 de HU-36b).
- Configurar Prisma con el adaptador para Neon y dos cadenas de conexión (una para la app, otra directa para las migraciones).
- Crear `docker-compose.yml` con Postgres y Redis locales (para pruebas de integración y de carga).
- Crear la migración inicial con el esquema completo del modelo de datos.
- Módulo `health` con dos endpoints: `GET /health/live` (sin dependencias, responde 200) y `GET /health/ready` (verifica Postgres y el almacén de disponibilidad; 503 si alguno falla; solo para CI y uso manual).
- GitHub Actions: instalar, lint, pruebas unitarias e integración (Postgres y Redis como servicios), build, y despliegue con `wrangler deploy` en la rama principal (secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`). Las migraciones se aplican en un paso de CI con la cadena directa de Neon, no desde el Worker.
- Documentar variables de entorno en `.env.example` y `.dev.vars.example` (incluir `COOKIE_DOMAIN`, `FRONTEND_ORIGIN` para CORS y `SESSION_TTL_DAYS`); `.dev.vars` en `.gitignore`.
- Configurar `api.xdtech.store` como Custom Domain del Worker y el frontend como Custom Domain de su proyecto en Cloudflare, ambos con HTTPS válido. Ver sección 2.2.
- Crear `docs/compatibilidad-cloudflare.md` con la tabla de resultados que llena HU-36b.

**Criterios de aceptación**
- `GET /health/live` responde 200 con `wrangler dev` y en `api.xdtech.store`, incluso con Postgres y el almacén de disponibilidad caídos.
- `GET /health/ready` responde 200 con ambos servicios activos y 503 si alguno falla.
- La migración se aplica en Neon y en Postgres local.
- La CI corre en cada push, pasa, y despliega el Worker al fusionar en la rama principal.
- El frontend vacío carga por HTTPS en el dominio configurado.

## HU-36b Pruebas de compatibilidad con Cloudflare
**Como** desarrollador, **quiero** que el agente compruebe con Wrangler los supuestos críticos de Cloudflare, **para** no descubrir bloqueos en el sprint de concurrencia.

**Cómo se ejecuta:** el agente corre cada prueba con Wrangler (primero en local con `wrangler dev`, luego desplegada) y registra el resultado en `docs/compatibilidad-cloudflare.md`: prueba, resultado (OK o no OK), medidas y decisión tomada. Ningún sprint posterior debe apoyarse en una prueba sin resultado OK o sin plan B documentado.

**Pruebas**
1. **NestJS en Workers:** un Worker con NestJS que responde `GET /health/live`. Anotar tamaño del bundle, tiempo de arranque de una instancia nueva y CPU por petición.
2. **Next.js en Cloudflare:** compilar y desplegar el frontend con Wrangler; una página renderizada en servidor y una llamada a la API con credenciales.
3. **Prisma con Neon desde un Worker:** una consulta real con el adaptador; anotar la latencia con la base dormida y despierta, y cuántos subrequests consume.
4. **Caché de concurrencia (decisión de la sección 5.3):**
   - Opción A: ejecutar un script Lua trivial en Upstash con `@upstash/redis` (`eval`/`evalsha`) y una reserva de varios productos de todo o nada.
   - Opción B: un Durable Object con SQLite que reserve varios productos de todo o nada, probado en `wrangler dev`.
   - En ambas: 300 intentos concurrentes sobre un componente de 5 unidades deben dar exactamente 5 reservas. Medir comandos o filas escritas por reserva, y la latencia.
5. **Hash de contraseñas:** medir el tiempo de CPU de la implementación elegida (JS/WASM o PBKDF2 con Web Crypto) con parámetros de costo razonables. El objetivo es no superar los 10 ms del plan gratuito.
6. **Cookie entre subdominios:** un endpoint temporal de `api.xdtech.store` emite una cookie `httpOnly; Secure; SameSite=Lax; Domain=.xdtech.store` y una petición con credenciales desde el frontend la envía de vuelta (CORS con credenciales solo para el origen del frontend). Eliminar el endpoint al terminar.
7. **IP real:** un endpoint temporal devuelve el encabezado `CF-Connecting-IP` desde una conexión real a `api.xdtech.store`. Confirmar también que `req.ip` no sirve.
8. **Cron Trigger:** un handler `scheduled` que se ejecuta localmente (`wrangler dev --test-scheduled`, a validar) y en producción.
9. **Subrequests:** contar las llamadas de una reserva de ejemplo y confirmar que quedan muy por debajo de 50.

**Criterios de aceptación**
- `docs/compatibilidad-cloudflare.md` completo, con OK o no OK y los números medidos para las nueve pruebas (la cookie probada al menos en Chrome y Safari o Firefox).
- **Decisión del caché registrada** con su motivo (opción A u opción B), aplicando la regla de la sección 5.3. Si se elige la B, se actualizan las referencias a Upstash en los documentos.
- Si NestJS no corre o su arranque o tamaño son inaceptables, se documenta y se decide el paso a Hono antes del Sprint 1.
- Si Next.js no funciona en Cloudflare, se documenta y el frontend pasa a Vercel con el DNS en Cloudflare.
- Si Prisma con Neon falla en Workers, se prueba el driver serverless de Neon directamente y se documenta el resultado.
- Si el hash no cabe en 10 ms, se documenta y se decide entre ajustar parámetros o el plan de pago de Workers.
- Si la cookie entre subdominios falla, se documenta y se decide la alternativa antes del Sprint 1.
- Si la API no recibe `CF-Connecting-IP`, se documenta y se decide el encabezado alternativo.

## Definición de hecho del sprint
Worker desplegado y accesible por HTTPS desde `api.xdtech.store`, frontend servido en su dominio (o con su plan B documentado), CI en verde con despliegue automático, esquema migrado, nueve pruebas de compatibilidad documentadas y la decisión del caché registrada.
