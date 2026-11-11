// Configuración de la CLI de Prisma (migraciones). El Worker NO usa esta URL:
// en ejecución se conecta por Hyperdrive (design.md D4).
// DIRECT_URL = cadena directa de Neon en CI/producción; si no está definida,
// se usa el Postgres local de docker-compose.
import { defineConfig } from 'prisma/config';

const POSTGRES_LOCAL = 'postgresql://xdtech:xdtech@localhost:5432/xdtech';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DIRECT_URL ?? POSTGRES_LOCAL },
});
