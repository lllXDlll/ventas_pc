import { describe, expect, it } from 'vitest';
import type { Registro } from './despacho';
import { type CriterioLimpieza, limpiarSesiones } from './limpieza-sesiones';

function registroDePrueba() {
  const entradas: { nivel: string; mensaje: string; datos: Record<string, unknown> }[] = [];
  const registro: Registro = {
    info: (mensaje, datos) => entradas.push({ nivel: 'info', mensaje, datos }),
    advertencia: (mensaje, datos) => entradas.push({ nivel: 'advertencia', mensaje, datos }),
  };
  return { registro, entradas };
}

describe('limpiarSesiones (spec tareas-programadas)', () => {
  it('borra vencidas y revocadas hace más de un día, y registra cuántas', async () => {
    const ahora = new Date('2026-11-12T04:00:00Z');
    let criterio: CriterioLimpieza | undefined;
    const { registro, entradas } = registroDePrueba();
    const borradas = await limpiarSesiones(
      async (c) => {
        criterio = c;
        return 2;
      },
      registro,
      ahora,
    );
    expect(borradas).toBe(2);
    expect(criterio).toEqual({ ahora, revocadasAntesDe: new Date('2026-11-11T04:00:00Z') });
    expect(entradas).toEqual([
      {
        nivel: 'info',
        mensaje: 'sesiones borradas',
        datos: { tarea: 'limpiarSesiones', borradas: 2 },
      },
    ]);
  });

  it('si la base falla, registra el error y no lo propaga', async () => {
    const { registro, entradas } = registroDePrueba();
    const resultado = await limpiarSesiones(async () => {
      throw new Error('connect ECONNREFUSED');
    }, registro);
    expect(resultado).toBeNull();
    expect(entradas).toEqual([
      {
        nivel: 'advertencia',
        mensaje: 'fallo al limpiar sesiones',
        datos: { tarea: 'limpiarSesiones', error: 'connect ECONNREFUSED' },
      },
    ]);
  });
});
