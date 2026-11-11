import { describe, expect, it } from 'vitest';
import {
  hashContrasena,
  ITERACIONES,
  verificarContraFicticio,
  verificarContrasena,
} from './contrasenas';

describe('hash de contraseñas (spec autenticacion)', () => {
  it('guarda pbkdf2$50000$<sal>$<hash>, nunca la contraseña', async () => {
    const guardado = await hashContrasena('secreto-largo');
    expect(guardado).toMatch(/^pbkdf2\$50000\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
    expect(guardado).not.toContain('secreto-largo');
    expect(ITERACIONES).toBe(50_000);
  });

  it('usa una sal distinta en cada hash', async () => {
    expect(await hashContrasena('igual')).not.toBe(await hashContrasena('igual'));
  });

  it('acepta la contraseña correcta y rechaza una incorrecta', async () => {
    const guardado = await hashContrasena('correcta-123');
    expect(await verificarContrasena('correcta-123', guardado)).toBe(true);
    expect(await verificarContrasena('incorrecta-123', guardado)).toBe(false);
  });

  it('verifica con las iteraciones guardadas en el hash', async () => {
    const anterior = await hashContrasena('vieja-clave', 1_000);
    expect(anterior.startsWith('pbkdf2$1000$')).toBe(true);
    expect(await verificarContrasena('vieja-clave', anterior)).toBe(true);
  });

  it('un formato inválido nunca coincide', async () => {
    for (const valor of [
      '',
      'texto',
      'bcrypt$10$a$b',
      'pbkdf2$0$a$b',
      'pbkdf2$200000$a$b',
      'pbkdf2$1000$!!$b',
    ]) {
      expect(await verificarContrasena('x', valor)).toBe(false);
    }
  });

  it('el hash ficticio siempre devuelve false', async () => {
    expect(await verificarContraFicticio('cualquiera')).toBe(false);
  });
});
