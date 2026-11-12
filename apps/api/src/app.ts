import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as classTransformer from 'class-transformer';
import * as classValidator from 'class-validator';
import type { Express } from 'express';
import { AppModule } from './app.module';
import { FiltroErrores } from './comun/filtro-errores';

export interface OpcionesApp {
  /** Único origen con permiso CORS y credenciales (nunca comodín). */
  origenFrontend: string;
}

/**
 * Configura NestJS sobre la instancia de Express recibida. No abre conexiones. Devuelve la
 * app para obtener servicios desde los crons y el RPC interno (Sprint 3).
 */
export async function crearApp(
  expressApp: Express,
  opciones: OpcionesApp,
): Promise<INestApplication> {
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
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      // Paquetes importados de forma estática: evita el require() diferido de NestJS
      // (loadPackage), que falla de forma intermitente en el pool de Vitest para
      // Workers y entonces llama a process.exit(1).
      validatorPackage: classValidator,
      transformerPackage: classTransformer,
    }),
  );
  app.useGlobalFilters(new FiltroErrores());
  await app.init();
  return app;
}
