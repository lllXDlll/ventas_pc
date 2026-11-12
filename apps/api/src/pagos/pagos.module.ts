import { Module } from '@nestjs/common';
import { PedidosModule } from '../reservas/pedidos.module';
import { ComprobantesController } from './comprobantes.controller';
import { ComprobantesService } from './comprobantes.service';
import { PagosController } from './pagos.controller';
import { PagosService } from './pagos.service';

/** Pago simulado y comprobantes (Sprint 4). */
@Module({
  imports: [PedidosModule],
  controllers: [PagosController, ComprobantesController],
  providers: [PagosService, ComprobantesService],
})
export class PagosModule {}
