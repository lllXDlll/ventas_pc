// TEMPORAL (Sprint 0, pruebas 3 y 9 de HU-36b). Se elimina en la tarea 8.1.
// Protegido con PROTOTIPO_TOKEN (escribe en Postgres): sin token configurado o sin
// la cabecera x-prototipo-token correcta responde 404.
// - Prueba 3: una escritura hecha con una conexión se lee de inmediato desde otra
//   conexión nueva por Hyperdrive (el caché de consultas debe estar desactivado).
// - Prueba 9: una reserva de ejemplo (Durable Object + registro en Postgres), para
//   contar sus subrequests en las métricas del Worker.
import { Controller, Headers, HttpCode, NotFoundException, Post } from '@nestjs/common';
import { env } from 'cloudflare:workers';
import { conPrisma } from '../../datos/prisma';
import type { Inventario } from '../../reservas/inventario';

const PREFIJO = 'prueba-sprint0-';

function exigirToken(token: string | undefined): void {
  const esperado = (env as unknown as { PROTOTIPO_TOKEN?: string }).PROTOTIPO_TOKEN;
  if (!esperado || token !== esperado) throw new NotFoundException();
}

@Controller('__prueba')
export class PruebasDatosController {
  @Post('escritura-lectura')
  @HttpCode(200)
  async escrituraLectura(@Headers('x-prototipo-token') token: string | undefined): Promise<{
    leidoDeInmediato: boolean;
    escrituraMs: number;
    lecturaMs: number;
  }> {
    exigirToken(token);
    const codigo = `${PREFIJO}${crypto.randomUUID()}`;
    // En Workers el reloj avanza con la E/S: estos tiempos son de pared.
    const t0 = Date.now();
    await conPrisma((p) => p.categoria.create({ data: { codigo, nombre: 'temporal' } }));
    const t1 = Date.now();
    // Otra llamada a conPrisma = otra conexión por Hyperdrive.
    const leida = await conPrisma((p) => p.categoria.findUnique({ where: { codigo } }));
    const t2 = Date.now();
    await conPrisma((p) => p.categoria.delete({ where: { codigo } }));
    return { leidoDeInmediato: leida !== null, escrituraMs: t1 - t0, lecturaMs: t2 - t1 };
  }

  @Post('reserva-ejemplo')
  @HttpCode(200)
  async reservaEjemplo(
    @Headers('x-prototipo-token') token: string | undefined,
  ): Promise<{ ok: boolean; filasEscritas: number }> {
    exigirToken(token);
    const ns = env.INVENTARIO as DurableObjectNamespace<Inventario>;
    const inventario = ns.get(ns.idFromName('prototipo:subrequests'));
    const productoId = 'producto-subrequests';
    const reservar = () => inventario.reservar([{ productoId, cantidad: 1 }], Date.now() + 60_000);
    // Camino normal: una sola llamada al objeto. Solo la primera vez se inicializa,
    // con stock amplio para que la reserva siempre tenga éxito.
    let resultado = await reservar();
    if (!resultado.ok && resultado.motivo === 'NO_INICIALIZADO') {
      await inventario.reconstruir(productoId, 1_000_000);
      resultado = await reservar();
    }
    // El registro en Postgres de la reserva, en una sola conexión: se escribe y se
    // borra una fila temporal (las tablas de reservas necesitan usuario y producto,
    // que llegan en sprints posteriores).
    const codigo = `${PREFIJO}${crypto.randomUUID()}`;
    await conPrisma(async (p) => {
      await p.categoria.create({ data: { codigo, nombre: 'reserva de ejemplo' } });
      await p.categoria.delete({ where: { codigo } });
    });
    return { ok: resultado.ok, filasEscritas: resultado.ok ? resultado.filasEscritas : 0 };
  }
}
