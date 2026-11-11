import { describe, expect, it } from 'vitest';
import { hashToken, leerConfigSesion, nuevoToken, opcionesCookie, tokenDeCookie } from './sesiones';

describe('cookie de sesión (spec autenticacion)', () => {
  it('en producción lleva Domain=.xdtech.store y Secure', () => {
    expect(opcionesCookie(leerConfigSesion({ COOKIE_DOMAIN: '.xdtech.store' }))).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      domain: '.xdtech.store',
      secure: true,
    });
  });

  it('en local va sin Domain ni Secure', () => {
    expect(opcionesCookie(leerConfigSesion({ COOKIE_DOMAIN: '' }))).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  });

  it('el vencimiento sale de SESSION_TTL_DAYS, 7 días por defecto', () => {
    expect(leerConfigSesion({}).ttlDias).toBe(7);
    expect(leerConfigSesion({ SESSION_TTL_DAYS: '3' }).ttlDias).toBe(3);
    expect(leerConfigSesion({ SESSION_TTL_DAYS: 'x' }).ttlDias).toBe(7);
  });
});

describe('token', () => {
  it('es aleatorio, de 256 bits en base64url, y su hash es SHA-256 en hexadecimal', async () => {
    const token = nuevoToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(nuevoToken()).not.toBe(token);
    expect(await hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('se lee de la cabecera Cookie', () => {
    expect(tokenDeCookie('a=1; xd_sesion=tok_en; b=2')).toBe('tok_en');
    expect(tokenDeCookie('xd_sesion=')).toBeUndefined();
    expect(tokenDeCookie(undefined)).toBeUndefined();
  });
});
