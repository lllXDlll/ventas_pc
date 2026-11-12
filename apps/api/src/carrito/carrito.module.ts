import { Module } from '@nestjs/common';
import { CompatibilidadModule } from '../compatibilidad/compatibilidad.module';
import { CarritoController } from './carrito.controller';
import { CarritoService } from './carrito.service';

@Module({
  imports: [CompatibilidadModule],
  controllers: [CarritoController],
  providers: [CarritoService],
  exports: [CarritoService],
})
export class CarritoModule {}
