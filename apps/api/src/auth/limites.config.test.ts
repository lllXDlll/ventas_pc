import { describe, expect, it } from 'vitest';
import { leerConfigLimites } from './limites.config';

const MINUTO = 60_000;

describe('leerConfigLimites', () => {
  it('usa los valores por defecto de la parte técnica', () => {
    expect(leerConfigLimites({})).toEqual({
      registro: { max: 5, ventanaMs: 60 * MINUTO },
      loginCorreo: { max: 5, ventanaMs: 15 * MINUTO },
      loginIp: { max: 50, ventanaMs: 15 * MINUTO },
    });
  });

  it('respeta un valor configurado', () => {
    expect(leerConfigLimites({ LIMITE_REGISTRO_MAX: '2' }).registro.max).toBe(2);
    expect(leerConfigLimites({ LIMITE_LOGIN_VENTANA_MIN: '30' }).loginIp.ventanaMs).toBe(
      30 * MINUTO,
    );
  });

  it('ignora un valor inválido con una advertencia', () => {
    const avisos: string[] = [];
    const config = leerConfigLimites({ LIMITE_LOGIN_IP_MAX: '0', LIMITE_REGISTRO_MAX: 'x' }, (m) =>
      avisos.push(m),
    );
    expect(config.loginIp.max).toBe(50);
    expect(config.registro.max).toBe(5);
    expect(avisos).toHaveLength(2);
  });
});
