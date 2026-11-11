import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
// TEMPORALES (Sprint 0): se eliminan en la tarea 8.1.
import { PruebasPlataformaController } from './comun/prototipos/pruebas-plataforma.controller';
import { PrototipoInventarioController } from './reservas/prototipos/prototipo-inventario.controller';

@Module({
  imports: [HealthModule],
  controllers: [PrototipoInventarioController, PruebasPlataformaController],
})
export class AppModule {}
