import { Module } from '@nestjs/common';
import { ConfiguracionesModule } from '../configuraciones/configuraciones.module';
import { AsistenteController } from './asistente.controller';
import { AsistenteService } from './asistente.service';
import { LimiteAsistenteService } from './limite.service';

/** Asistente de IA (Sprint 5). */
@Module({
  imports: [ConfiguracionesModule],
  controllers: [AsistenteController],
  providers: [AsistenteService, LimiteAsistenteService],
})
export class AsistenteModule {}
