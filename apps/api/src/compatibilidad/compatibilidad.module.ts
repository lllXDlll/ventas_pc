import { Module } from '@nestjs/common';
import { CompatibilidadController } from './compatibilidad.controller';
import { CompatibilidadService } from './compatibilidad.service';

@Module({
  controllers: [CompatibilidadController],
  providers: [CompatibilidadService],
  exports: [CompatibilidadService],
})
export class CompatibilidadModule {}
