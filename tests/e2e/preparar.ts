// Preparación de la base para las pruebas e2e (local o CI): categorías, catálogo de
// ejemplo y un administrador de prueba. Las migraciones se aplican antes
// (`pnpm --filter api migrate:deploy` en la CI; `migrate:dev` en local).
import { prepararBaseDePruebas, URL_LOCAL } from '../../apps/api/scripts/semillas.ts';
import { ADMIN } from './datos';

export default async function preparar(): Promise<void> {
  await prepararBaseDePruebas(process.env.DIRECT_URL || URL_LOCAL, ADMIN);
}
