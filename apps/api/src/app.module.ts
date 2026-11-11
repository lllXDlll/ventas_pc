import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
// TEMPORAL (Sprint 0): se elimina en la tarea 8.1.
import { PrototipoInventarioController } from './reservas/prototipos/prototipo-inventario.controller';

@Module({
  imports: [HealthModule],
  controllers: [PrototipoInventarioController],
})
export class AppModule {}
