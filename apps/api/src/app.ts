import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { Express } from 'express';
import { AppModule } from './app.module';
import { FiltroErrores } from './comun/filtro-errores';

export interface OpcionesApp {
  /** Único origen con permiso CORS y credenciales (nunca comodín). */
  origenFrontend: string;
}

/** Configura NestJS sobre la instancia de Express recibida. No abre conexiones. */
export async function crearApp(expressApp: Express, opciones: OpcionesApp): Promise<void> {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
    logger: ['error', 'warn'],
  });
  expressApp.disable('x-powered-by');
  // Solo el origen del frontend recibe cabeceras CORS; cualquier otro, ninguna.
  app.enableCors({
    origin: (origen: string | undefined, cb: (error: Error | null, permitir?: boolean) => void) =>
      cb(null, origen === opciones.origenFrontend),
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new FiltroErrores());
  await app.init();
}
