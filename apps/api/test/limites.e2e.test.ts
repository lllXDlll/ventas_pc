// Durable Object Limites (spec limite-peticiones, design.md D5 del Sprint 1),
// dentro del runtime de Workers.
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { Limites } from '../src/auth/limites';

const MINUTO = 60_000;
const T0 = 1_800_000_000_000;

/** Objeto aislado por prueba (en producción hay uno por clave). */
function limite() {
  const ns = env.LIMITES as DurableObjectNamespace<Limites>;
  return ns.get(ns.idFromName(crypto.randomUUID()));
}

describe('Limites.consumir', () => {
  it('permite exactamente `max` intentos dentro de la ventana', async () => {
    const l = limite();
    const decisiones = [];
    for (let i = 0; i < 6; i++) decisiones.push(await l.consumir(5, 60 * MINUTO, T0 + i));
    expect(decisiones.map((d) => d.permitido)).toEqual([true, true, true, true, true, false]);
    expect(decisiones[5]?.reintentarEnS).toBe(3600);
  });

  it('vuelve a permitir cuando vence la ventana, que empieza en el primer intento', async () => {
    const l = limite();
    for (let i = 0; i < 5; i++) await l.consumir(5, 60 * MINUTO, T0 + i * MINUTO);
    expect((await l.consumir(5, 60 * MINUTO, T0 + 59 * MINUTO)).permitido).toBe(false);
    expect((await l.consumir(5, 60 * MINUTO, T0 + 60 * MINUTO)).permitido).toBe(true);
  });

  it('10 llamadas concurrentes con máximo 5 dan exactamente 5 permitidas', async () => {
    const l = limite();
    const decisiones = await Promise.all(
      Array.from({ length: 10 }, () => l.consumir(5, 60 * MINUTO)),
    );
    expect(decisiones.filter((d) => d.permitido)).toHaveLength(5);
  });
});

describe('Limites: fallos de inicio de sesión', () => {
  it('consultar no cuenta; registrarFallo sí', async () => {
    const l = limite();
    for (let i = 0; i < 10; i++)
      expect((await l.consultar(5, 15 * MINUTO, T0)).permitido).toBe(true);
    for (let i = 0; i < 5; i++) await l.registrarFallo(15 * MINUTO, T0 + i);
    const d = await l.consultar(5, 15 * MINUTO, T0 + 10);
    expect(d.permitido).toBe(false);
    expect(d.reintentarEnS).toBe(900);
  });

  it('reiniciar borra el contador', async () => {
    const l = limite();
    for (let i = 0; i < 3; i++) await l.registrarFallo(15 * MINUTO, T0);
    await l.reiniciar();
    for (let i = 0; i < 4; i++) await l.registrarFallo(15 * MINUTO, T0 + 1);
    expect((await l.consultar(5, 15 * MINUTO, T0 + 2)).permitido).toBe(true);
  });
});
