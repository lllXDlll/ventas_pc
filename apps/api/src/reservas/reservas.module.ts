import { Global, Module } from '@nestjs/common';
import { env } from 'cloudflare:workers';
import { DisponibleDurableObject, DisponibleService } from './disponible.service';
import type { Inventario } from './inventario';

/** Expone el puerto DisponibleService a la salud y al catálogo. */
@Global()
@Module({
  providers: [
    {
      provide: DisponibleService,
      useFactory: () =>
        new DisponibleDurableObject(env.INVENTARIO as DurableObjectNamespace<Inventario>),
    },
  ],
  exports: [DisponibleService],
})
export class ReservasModule {}
