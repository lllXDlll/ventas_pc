import { conPrisma } from '../datos/prisma';
import type { BorrarSesiones } from './limpieza-sesiones';

/** Borrado de sesiones vencidas o revocadas hace más de un día, en una sola consulta. */
export const borrarSesionesCaducadas: BorrarSesiones = async ({ ahora, revocadasAntesDe }) => {
  const { count } = await conPrisma((p) =>
    p.sesion.deleteMany({
      where: {
        OR: [{ venceEn: { lte: ahora } }, { revocada: true, revocadaEn: { lt: revocadasAntesDe } }],
      },
    }),
  );
  return count;
};
