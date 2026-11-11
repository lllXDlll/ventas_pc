import { Module } from '@nestjs/common';
import { env } from 'cloudflare:workers';
import { conPrisma } from '../datos/prisma';
import { DisponibleService } from '../reservas/disponible.service';
import { HealthController } from './health.controller';
import { COMPROBADORES, type Comprobador, TIEMPO_ESPERA_MS } from './salud.service';

@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: TIEMPO_ESPERA_MS,
      useFactory: () => Number(env.HEALTH_TIMEOUT_MS) || 3000,
    },
    {
      provide: COMPROBADORES,
      inject: [DisponibleService],
      useFactory: (disponible: DisponibleService): Comprobador[] => [
        {
          nombre: 'postgres',
          comprobar: () => conPrisma(async (p) => void (await p.$queryRaw`SELECT 1`)),
        },
        { nombre: 'almacen', comprobar: () => disponible.ping() },
      ],
    },
  ],
})
export class HealthModule {}
