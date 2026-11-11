# Sprint 7: Despliegue final y cierre (semana 8)

> Contexto previo: `00_parte_tecnica.md`. Implementa solo lo de este documento.

**Objetivo:** sistema en línea en Cloudflare, demo ensayada y documentación final.
**Depende de:** Sprint 6 (sistema completo y probado) y de los resultados de `docs/compatibilidad-cloudflare.md` del Sprint 0.

## HU-36c Despliegue final
**Como** desarrollador, **quiero** el sistema desplegado en Cloudflare, **para** presentarlo en línea.

**Criterios de aceptación**
- Frontend y API desplegados en Cloudflare con Wrangler: la API en `api.xdtech.store` (Custom Domain del Worker) y el frontend en `xdtech.store` o `app.xdtech.store`. Si el Sprint 0 obligó al plan B, el frontend sigue en Vercel con el DNS en Cloudflare (ver sección 2.2 de `00_parte_tecnica.md`).
- Base de datos en Neon y almacén de disponibilidad según la decisión registrada en el Sprint 0 (Redis en Upstash o Durable Object), todo accesible por HTTPS.
- Registro, inicio y cierre de sesión funcionan en producción entre el frontend y `api.` con la cookie `Domain=.xdtech.store`, en al menos dos navegadores.
- Despliegue con `wrangler deploy` disparado desde la rama principal en GitHub Actions. Las migraciones se aplican en un paso de CI con la cadena directa de Neon, no al arrancar el Worker.
- Los tres Cron Triggers (expiración, reconciliación y limpieza de sesiones) están activos en producción y se verifica que se ejecutan.
- No hay monitor externo: en Workers no existe el arranque en frío de un servicio dormido. Antes de la demo se despierta Neon con una petición real.
- El README documenta los límites vigentes de Workers (peticiones al día, CPU por petición, subrequests), Neon y, según la decisión, Upstash o Durable Objects, junto con el consumo observado durante las pruebas.
- Se confirman los límites vigentes de los planes gratuitos antes de la demo.
- Se mantiene el plan de respaldo de ejecutar el backend con `wrangler dev` y Postgres y Redis en Docker local.

**Tareas:** configurar secretos con `wrangler secret put` (clave de la API de IA, cadenas de Neon y, si se eligió la opción A, las credenciales de Upstash) y variables no secretas en `wrangler.jsonc` (`COOKIE_DOMAIN=.xdtech.store`, `FRONTEND_ORIGIN`), pipeline de despliegue, verificación de CORS con credenciales y de la cookie entre subdominios (ya probada en el Sprint 0), prueba de humo en producción (registro, compra de extremo a extremo, asistente).

## Cierre del proyecto
- Ensayo de la demo: flujo del cliente completo, flujo del asistente de IA, escenario de concurrencia y panel administrativo. Despertar Neon antes de empezar.
- Documentación: arquitectura final (cinco piezas, sin cola de mensajes ni balanceador propio), diagramas actualizados, manual breve e informe de pruebas con los resultados de k6 y `docs/compatibilidad-cloudflare.md`. El informe debe incluir la sección de alcance diferido (recuperación de acceso, RF-03) y la de desviaciones respecto a la propuesta original (despliegue en Workers en lugar de NGINX y Docker, Cron Triggers en lugar de BullMQ, decisión del caché), con su justificación, tomadas de la sección 10 de `00_parte_tecnica.md`.

## Definición de hecho del sprint
Sistema accesible en línea en Cloudflare, demo ensayada y documentación entregada.
