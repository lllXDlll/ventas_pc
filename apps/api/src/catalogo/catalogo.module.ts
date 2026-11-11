import { Module } from '@nestjs/common';
import { AdminCatalogoController, CatalogoController } from './catalogo.controller';
import { CatalogoService } from './catalogo.service';

@Module({
  controllers: [CatalogoController, AdminCatalogoController],
  providers: [CatalogoService],
})
export class CatalogoModule {}
