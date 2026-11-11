import { describe, expect, it } from 'vitest';
import { aErrorApi } from './filtro-errores';

describe('aErrorApi', () => {
  it('respeta codigo y mensaje propios de un error de negocio', () => {
    expect(aErrorApi(409, { codigo: 'STOCK_OBSOLETO', mensaje: 'El stock cambió.' }, 'x')).toEqual({
      codigo: 'STOCK_OBSOLETO',
      mensaje: 'El stock cambió.',
    });
  });

  it('une los mensajes de validación', () => {
    expect(aErrorApi(400, { message: ['correo inválido', 'contraseña corta'] }, 'x')).toEqual({
      codigo: 'SOLICITUD_INVALIDA',
      mensaje: 'correo inválido. contraseña corta',
    });
  });

  it('usa el código por estado y el mensaje por defecto si no hay detalle', () => {
    expect(aErrorApi(429, {}, 'Demasiados intentos.')).toEqual({
      codigo: 'DEMASIADAS_PETICIONES',
      mensaje: 'Demasiados intentos.',
    });
  });

  it('usa ERROR para estados sin código conocido', () => {
    expect(aErrorApi(418, 'Soy una tetera', 'x')).toEqual({
      codigo: 'ERROR',
      mensaje: 'Soy una tetera',
    });
  });
});
