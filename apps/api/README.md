# API (NestJS en Cloudflare Workers)

Backend de xdtech.store. Contexto y decisiones: `docs/00_parte_tecnica.md`,
`docs/01_arquitectura_despliegue.md` y `docs/compatibilidad-cloudflare.md`.

## Desarrollo local

```bash
docker compose up -d                     # Postgres local (desde la raíz del repo)
cp apps/api/.dev.vars.example apps/api/.dev.vars
pnpm --filter api migrate:dev            # aplica las migraciones en local
pnpm --filter api semilla:catalogo       # categorías y catálogo de ejemplo
pnpm --filter api dev                    # wrangler dev en http://localhost:8787
```

Pruebas: `pnpm --filter api test` (unitarias y e2e en workerd) y
`pnpm --filter api test:int` (integración contra el Postgres local).

## Semillas

`scripts/semillas.ts` se ejecuta con Node 24 y `pg` sobre `DIRECT_URL`. Sin esa
variable usa el Postgres de docker-compose. Las tres partes son idempotentes.

| Comando                                | Qué carga                         | Dónde se ejecuta                                                      |
| -------------------------------------- | --------------------------------- | --------------------------------------------------------------------- |
| `pnpm --filter api semilla:categorias` | Las ocho categorías               | Automático en el job `desplegar` de la CI, después de las migraciones |
| `pnpm --filter api semilla:catalogo`   | Categorías y catálogo de ejemplo  | Manual: local y demo                                                  |
| `pnpm --filter api semilla:admin`      | Crea o actualiza el administrador | Manual, una vez por entorno                                           |

### Administrador y catálogo en producción (Neon)

Usa la cadena **directa** de Neon (la misma del secreto `NEON_DIRECT_URL` de la CI). El script
muestra a qué base se conecta (sin la contraseña) y rechaza una cadena incompleta o la del pooler.
El correo y la contraseña del administrador se pasan en el momento: nunca se
guardan en el repositorio ni en `.env`. La contraseña debe tener al menos 12
caracteres.

PowerShell:

```powershell
# Pega la cadena completa: postgresql://usuario:clave@ep-….neon.tech/neondb?sslmode=require
# (la DIRECTA, sin "-pooler" en el host; sin "psql" ni comillas alrededor).
$env:DIRECT_URL = Read-Host "Cadena directa de Neon"
$env:ADMIN_CORREO = "admin@xdtech.store"
$env:ADMIN_CONTRASENA = Read-Host "Contraseña del administrador"
pnpm --filter api semilla:admin
pnpm --filter api semilla:catalogo
Remove-Item Env:DIRECT_URL, Env:ADMIN_CORREO, Env:ADMIN_CONTRASENA
```

Bash:

```bash
read -rs -p "Contraseña del administrador: " ADMIN_CONTRASENA; echo
DIRECT_URL='<cadena directa de Neon>' ADMIN_CORREO=admin@xdtech.store \
  ADMIN_CONTRASENA="$ADMIN_CONTRASENA" pnpm --filter api semilla:admin
DIRECT_URL='<cadena directa de Neon>' pnpm --filter api semilla:catalogo
unset ADMIN_CONTRASENA
```

Volver a ejecutar `semilla:admin` con otra contraseña la reemplaza.
