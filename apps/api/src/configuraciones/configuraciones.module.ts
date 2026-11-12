import { Module } from '@nestjs/common';
import { CompatibilidadModule } from '../compatibilidad/compatibilidad.module';
import { ConfiguracionesController } from './configuraciones.controller';
import { ConfiguracionesService } from './configuraciones.service';

@Module({
  imports: [CompatibilidadModule],
  controllers: [ConfiguracionesController],
  providers: [ConfiguracionesService],
  exports: [ConfiguracionesService],
})
export class ConfiguracionesModule {}
