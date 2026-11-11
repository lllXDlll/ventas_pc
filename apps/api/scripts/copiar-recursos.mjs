// Copia a dist/ los archivos que tsc no emite pero el cliente de Prisma importa
// en tiempo de ejecución (compilador de consultas en WASM y su envoltorio JS).
import { cpSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const origen = join(import.meta.dirname, '..', 'src', 'generated', 'prisma', 'internal');
const destino = join(import.meta.dirname, '..', 'dist', 'generated', 'prisma', 'internal');

if (!existsSync(origen)) {
  console.error(
    'No existe el cliente de Prisma generado. Ejecuta: pnpm --filter api prisma:generate',
  );
  process.exit(1);
}

const recursos = readdirSync(origen).filter((f) => f.endsWith('.wasm') || f.endsWith('.js'));
for (const archivo of recursos) cpSync(join(origen, archivo), join(destino, archivo));
console.log(`Recursos de Prisma copiados a dist: ${recursos.join(', ')}`);
