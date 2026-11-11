# Proposal

## Why

El proyecto no tiene código: solo documentación (`docs/00_parte_tecnica.md`, `docs/01_arquitectura_despliegue.md` y los sprints). Todo el stack se apoya en supuestos de Cloudflare sin comprobar (NestJS y Next.js en Workers, Prisma con Neon, cookie entre subdominios, `CF-Connecting-IP`, CPU del hash, Cron Triggers) y en una decisión abierta: el almacén de disponibilidad (Upstash con Lua o Durable Object). El Sprint 0 (HU-36a y HU-36b) existe para levantar la base y validar esos supuestos antes de construir encima; si alguno falla en el Sprint 3, el costo de rehacer es alto.

## What Changes

- Monorepo con `apps/web` (Next.js) y `apps/api` (NestJS sobre Cloudflare Workers con `httpServerHandler`), estructura de carpetas de la sección 3 de la parte técnica.
- `wrangler.jsonc` versionado sin secretos, `compatibility_date` ≥ `2026-08-04`, tres Cron Triggers (expiración cada minuto, reconciliación cada 5 min, limpieza diaria de sesiones) y un handler `scheduled` que despacha cada uno a su tarea (vacías por ahora).
- Endpoints `GET /health/live` y `GET /health/ready`.
- Prisma con acceso a Neon mediante **Cloudflare Hyperdrive** (decisión del desarrollador), la cadena directa de Neon para las migraciones y la migración inicial con el modelo de datos completo (sección 4).
- Almacén de disponibilidad en **Durable Object con SQLite (opción B)**, elegido por el desarrollador para mantener todo dentro de Cloudflare (Cloudflare no ofrece un Redis propio). El Sprint 0 lo confirma con pruebas; Upstash queda solo como respaldo.
- `docker-compose.yml` con Postgres local (Redis no hace falta con la opción B).
- GitHub Actions: lint, pruebas unitarias e integración, build, migraciones con la cadena directa de Neon y `wrangler deploy` en la rama principal.
- `.env.example`, `.dev.vars.example` y `.gitignore` con `.dev.vars`.
- Custom Domains `api.xdtech.store` y el del frontend con HTTPS.
- `docs/compatibilidad-cloudflare.md` con las nueve pruebas de humo de HU-36b, sus mediciones y las decisiones tomadas, **incluida la confirmación de la opción B del almacén** con la regla de la sección 5.3.
- Endpoints temporales para las pruebas de cookie e IP, que se eliminan al terminar.

Fuera de este cambio: autenticación, catálogo y toda funcionalidad de negocio (Sprint 1 en adelante). La implementación definitiva del almacén de disponibilidad es del Sprint 3; aquí solo se prototipa para decidir.

## Capabilities

### New Capabilities

- `salud-api`: endpoints de vida y preparación de la API y su contrato de respuesta según el estado de Postgres y del almacén de disponibilidad.
- `tareas-programadas`: ejecución de tareas periódicas por Cron Triggers y despacho de cada horario a su tarea.
- `esquema-datos`: modelo persistente inicial en Postgres y las restricciones de integridad de las que dependen los sprints siguientes.
- `entrega-continua`: verificación automática en cada push, migraciones y despliegue a Cloudflare desde la rama principal, sin secretos en el repositorio.
- `validacion-plataforma`: registro verificable de las pruebas de compatibilidad con Cloudflare y de las decisiones de plataforma (almacén, framework del backend, alojamiento del frontend), como condición para empezar el Sprint 1.

### Modified Capabilities

Ninguna (no existen specs previas).

## Impact

- **Código nuevo:** todo el repositorio (`apps/web`, `apps/api`, `prisma/`, `tests/`, `.github/workflows/`, `docker-compose.yml`).
- **Servicios externos:** Cloudflare (Workers, Durable Objects, Hyperdrive, DNS, Custom Domains, Cron Triggers), Neon, GitHub Actions, Upstash (solo si la opción B falla), Vercel (solo si el frontend necesita el plan B).
- **Prerrequisitos fuera del código:** dominio `xdtech.store` comprado con DNS en Cloudflare, cuentas creadas, `wrangler login`, repositorio Git y remoto en GitHub (hoy la carpeta no es un repositorio Git).
- **Documentos:** Hyperdrive y la opción B ya difieren de la parte técnica, y lo mismo pasará con cualquier otro plan B que elija el Sprint 0; hay que actualizar las referencias en `docs/00_parte_tecnica.md`, `docs/01_arquitectura_despliegue.md` y los sprints afectados.
