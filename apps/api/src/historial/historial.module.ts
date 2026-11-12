import { Module } from '@nestjs/common';
import { ConfiguracionesModule } from '../configuraciones/configuraciones.module';
import { HistorialController } from './historial.controller';
import { HistorialService } from './historial.service';

/** Historial de compras y configuraciones (Sprint 4). */
@Module({
  imports: [ConfiguracionesModule],
  controllers: [HistorialController],
  providers: [HistorialService],
})
export class HistorialModule {}
