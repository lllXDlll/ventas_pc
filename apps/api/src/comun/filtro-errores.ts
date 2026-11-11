import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { DemasiadasPeticiones } from './errores';

// Formato único de error de la API: { codigo, mensaje } (parte técnica, sección 6).

const CODIGOS_POR_ESTADO: Record<number, string> = {
  400: 'SOLICITUD_INVALIDA',
  401: 'NO_AUTENTICADO',
  403: 'SIN_PERMISO',
  404: 'NO_ENCONTRADO',
  409: 'CONFLICTO',
  429: 'DEMASIADAS_PETICIONES',
  503: 'NO_DISPONIBLE',
};

export interface ErrorApi {
  codigo: string;
  mensaje: string;
  /** Datos adicionales del error de negocio (por ejemplo, la versión vigente en un 409). */
  detalle?: Record<string, unknown>;
}

export function aErrorApi(estado: number, respuesta: unknown, mensajePorDefecto: string): ErrorApi {
  const codigoPorDefecto = CODIGOS_POR_ESTADO[estado] ?? 'ERROR';
  if (typeof respuesta === 'string') return { codigo: codigoPorDefecto, mensaje: respuesta };
  if (respuesta && typeof respuesta === 'object') {
    const r = respuesta as {
      codigo?: unknown;
      mensaje?: unknown;
      message?: unknown;
      detalle?: unknown;
    };
    const codigo = typeof r.codigo === 'string' ? r.codigo : codigoPorDefecto;
    if (typeof r.mensaje === 'string') {
      const detalle =
        r.detalle && typeof r.detalle === 'object' && !Array.isArray(r.detalle)
          ? { detalle: r.detalle as Record<string, unknown> }
          : {};
      return { codigo, mensaje: r.mensaje, ...detalle };
    }
    // Errores de validación de class-validator llegan como message: string[].
    if (Array.isArray(r.message)) return { codigo, mensaje: r.message.join('. ') };
    if (typeof r.message === 'string') return { codigo, mensaje: r.message };
  }
  return { codigo: codigoPorDefecto, mensaje: mensajePorDefecto };
}

@Catch()
export class FiltroErrores implements ExceptionFilter {
  catch(excepcion: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (excepcion instanceof HttpException) {
      const estado = excepcion.getStatus();
      // Ruta inexistente: NestJS responde "Cannot GET /x"; se reemplaza por un mensaje claro.
      if (estado === 404 && excepcion.message.startsWith('Cannot ')) {
        res
          .status(404)
          .json({ codigo: 'NO_ENCONTRADO', mensaje: 'El recurso solicitado no existe.' });
        return;
      }
      if (excepcion instanceof DemasiadasPeticiones) {
        res.setHeader('Retry-After', String(excepcion.reintentarEnS));
      }
      res.status(estado).json(aErrorApi(estado, excepcion.getResponse(), excepcion.message));
      return;
    }
    console.error(
      JSON.stringify({ nivel: 'error', mensaje: 'error no controlado', error: String(excepcion) }),
    );
    res
      .status(500)
      .json({ codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado. Intenta de nuevo.' });
  }
}
