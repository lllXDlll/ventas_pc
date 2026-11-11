import { Module } from '@nestjs/common';
import { AdminCatalogoController, CatalogoController } from './catalogo.controller';
import { CatalogoService } from './catalogo.service';
import { AdminImagenesController, ImagenesController } from './imagenes.controller';
import { ImagenesService } from './imagenes.service';

@Module({
  controllers: [
    CatalogoController,
    AdminCatalogoController,
    ImagenesController,
    AdminImagenesController,
  ],
  providers: [CatalogoService, ImagenesService],
})
export class CatalogoModule {}
