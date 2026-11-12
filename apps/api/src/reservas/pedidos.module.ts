import { Module } from '@nestjs/common';
import { CarritoModule } from '../carrito/carrito.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { ConfirmacionService } from './confirmacion.service';
import { ReconciliacionService } from './reconciliacion.service';
import { ReservasController } from './reservas.controller';
import { ReservasService } from './reservas.service';

/**
 * Reservas, confirmación y reconciliación (Sprint 3). Aparte de ReservasModule (global,
 * solo el puerto DisponibleService) para no formar un ciclo con el carrito.
 */
@Module({
  imports: [CarritoModule, NotificacionesModule],
  controllers: [ReservasController],
  providers: [ReservasService, ConfirmacionService, ReconciliacionService],
  exports: [ReservasService, ConfirmacionService, ReconciliacionService],
})
export class PedidosModule {}
