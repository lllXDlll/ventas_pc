import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'jsonc-parser';
import { describe, expect, it, vi } from 'vitest';
import { despachar, HORARIOS, type Registro, type Tareas } from './despacho';

function crearDobles() {
  const tareas: Tareas = {
    expirar: vi.fn(async () => {}),
    reconciliar: vi.fn(async () => {}),
    limpiarSesiones: vi.fn(async () => {}),
  };
  const registro: Registro = { info: vi.fn(), advertencia: vi.fn() };
  return { tareas, registro };
}

describe('despachar', () => {
  it.each([
    ['* * * * *', 'expirar'],
    ['*/5 * * * *', 'reconciliar'],
    ['0 4 * * *', 'limpiarSesiones'],
  ] as const)('el cron "%s" ejecuta solo la tarea %s y la registra', async (cron, esperada) => {
    const { tareas, registro } = crearDobles();

    const ejecutada = await despachar(cron, tareas, registro);

    expect(ejecutada).toBe(esperada);
    for (const [nombre, tarea] of Object.entries(tareas)) {
      expect(tarea).toHaveBeenCalledTimes(nombre === esperada ? 1 : 0);
    }
    expect(registro.info).toHaveBeenCalledWith('tarea programada', { tarea: esperada, cron });
  });

  it('un cron desconocido no ejecuta nada y registra una advertencia', async () => {
    const { tareas, registro } = crearDobles();

    const ejecutada = await despachar('1 2 3 4 5', tareas, registro);

    expect(ejecutada).toBeNull();
    for (const tarea of Object.values(tareas)) expect(tarea).not.toHaveBeenCalled();
    expect(registro.advertencia).toHaveBeenCalledWith('cron no reconocido', { cron: '1 2 3 4 5' });
  });

  it('no confunde propiedades heredadas con horarios', async () => {
    const { tareas, registro } = crearDobles();
    expect(await despachar('toString', tareas, registro)).toBeNull();
  });
});

describe('HORARIOS', () => {
  it('coincide exactamente con triggers.crons de wrangler.jsonc', () => {
    const texto = readFileSync(join(import.meta.dirname, '../../wrangler.jsonc'), 'utf8');
    const config = parse(texto) as { triggers: { crons: string[] } };

    expect([...config.triggers.crons].sort()).toEqual(Object.keys(HORARIOS).sort());
  });

  it('declara tres tareas distintas', () => {
    expect(new Set(Object.values(HORARIOS))).toEqual(
      new Set(['expirar', 'reconciliar', 'limpiarSesiones']),
    );
  });
});
