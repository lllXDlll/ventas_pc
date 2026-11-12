import { Module } from '@nestjs/common';
import { ReglasController } from './reglas.controller';
import { ReglasService } from './reglas.service';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

/** Gestión y reportes del panel administrativo (Sprint 6). */
@Module({
  controllers: [ReglasController, ReportesController],
  providers: [ReglasService, ReportesService],
})
export class AdminModule {}
