import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
// TEMPORALES (Sprint 0): se eliminan en la tarea 8.1.
import { PruebasDatosController } from './comun/prototipos/pruebas-datos.controller';
import { PruebasPlataformaController } from './comun/prototipos/pruebas-plataforma.controller';
import { PrototipoInventarioController } from './reservas/prototipos/prototipo-inventario.controller';

@Module({
  imports: [HealthModule],
  controllers: [PrototipoInventarioController, PruebasPlataformaController, PruebasDatosController],
})
export class AppModule {}
