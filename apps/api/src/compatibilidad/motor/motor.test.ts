// Pruebas del motor de compatibilidad (spec motor-compatibilidad, tareas 2.1 a 2.6).
import { describe, expect, it } from 'vitest';
import { type ConfigRegla, evaluar } from './orquestador';
import { CODIGOS_REGLA } from './parametros';
import {
  ReglaAlmacenamiento,
  ReglaDimensiones,
  ReglaFactorForma,
  ReglaPotencia,
  ReglaRam,
  ReglaSocket,
} from './reglas';
import { agrupar, type CategoriaPieza, type Pieza, type Regla } from './tipos';

let n = 0;
const pieza = (
  categoria: CategoriaPieza,
  nombre: string,
  atributos: Record<string, unknown>,
  cantidad = 1,
): Pieza => ({ id: `p${++n}`, nombre, categoria, atributos, cantidad });

const cpu = (atributos: Record<string, unknown> = {}) =>
  pieza('PROCESADOR', 'Ryzen 5 7600', { socket: 'AM5', potenciaConsumidaW: 65, ...atributos });
const placa = (atributos: Record<string, unknown> = {}) =>
  pieza('PLACA_MADRE', 'B650 Plus', {
    socket: 'AM5',
    tipoRam: 'DDR5',
    velocidadRamMaxMhz: 6400,
    maxModulosRam: 4,
    factorForma: 'ATX',
    interfacesAlmacenamiento: ['M.2', 'SATA'],
    ...atributos,
  });
const ram = (atributos: Record<string, unknown> = {}, cantidad = 1) =>
  pieza(
    'RAM',
    'Fury 32 GB',
    { tipoRam: 'DDR5', velocidadRam: 6000, modulos: 2, ...atributos },
    cantidad,
  );
const gpu = (atributos: Record<string, unknown> = {}) =>
  pieza('TARJETA_GRAFICA', 'RX 7800 XT', { potenciaConsumidaW: 263, largoMm: 320, ...atributos });
const fuente = (w: number) => pieza('FUENTE', `Fuente ${w} W`, { potenciaEntregadaW: w });
const gabinete = (atributos: Record<string, unknown> = {}) =>
  pieza('GABINETE', 'Lancool 216', {
    factoresFormaSoportados: ['ATX', 'mATX', 'ITX'],
    largoGpuMaxMm: 392,
    altoDisipadorMaxMm: 180,
    ...atributos,
  });
const disco = (interfaz: string) => pieza('ALMACENAMIENTO', `SSD ${interfaz}`, { interfaz });

const SIN_PARAMS = {};
const reglaEn = (piezas: Pieza[]) => agrupar(piezas);

describe('agrupar', () => {
  it('ubica cada pieza por categoría; RAM y almacenamiento admiten varias', () => {
    const c = agrupar([cpu(), placa(), ram(), ram(), disco('SATA'), gabinete()]);
    expect(c.procesador?.categoria).toBe('PROCESADOR');
    expect(c.placa?.categoria).toBe('PLACA_MADRE');
    expect(c.ram).toHaveLength(2);
    expect(c.almacenamiento).toHaveLength(1);
    expect(c.gpu).toBeUndefined();
  });
});

describe('SOCKET', () => {
  const regla: Regla = new ReglaSocket();
  it('sockets iguales (sin distinguir mayúsculas): aprobado', () => {
    expect(regla.validar(reglaEn([cpu({ socket: 'am5' }), placa()]), SIN_PARAMS)).toEqual([]);
  });
  it('sockets distintos: rechazo que nombra las piezas y ambos sockets', () => {
    const c = cpu({ socket: 'LGA1700' });
    const p = placa();
    const [r, ...resto] = regla.validar(reglaEn([c, p]), SIN_PARAMS);
    expect(resto).toEqual([]);
    expect(r).toMatchObject({ codigo: 'SOCKET', productos: [c.id, p.id] });
    for (const t of ['Ryzen 5 7600', 'B650 Plus', 'LGA1700', 'AM5'])
      expect(r?.mensaje).toContain(t);
  });
  it('sin placa: no evalúa', () => {
    expect(regla.validar(reglaEn([cpu({ socket: 'LGA1700' })]), SIN_PARAMS)).toEqual([]);
  });
});

describe('RAM', () => {
  const regla: Regla = new ReglaRam();
  it('tipo, velocidad y módulos dentro de lo admitido: aprobado', () => {
    expect(regla.validar(reglaEn([placa(), ram({}, 2)]), SIN_PARAMS)).toEqual([]);
  });
  it('tipo no soportado: rechazo que nombra ambos tipos', () => {
    const [r] = regla.validar(reglaEn([placa(), ram({ tipoRam: 'DDR4', velocidadRam: 3200 })]), {});
    expect(r?.codigo).toBe('RAM');
    expect(r?.mensaje).toContain('DDR4');
    expect(r?.mensaje).toContain('DDR5');
  });
  it('velocidad mayor que la soportada: rechazo con ambas velocidades', () => {
    const [r] = regla.validar(
      reglaEn([placa({ velocidadRamMaxMhz: 5600 }), ram({ velocidadRam: 6000 })]),
      {},
    );
    expect(r?.mensaje).toContain('6000 MHz');
    expect(r?.mensaje).toContain('5600 MHz');
  });
  it('3 kits de 2 módulos en una placa de 4: rechazo con 6 frente a 4', () => {
    const [r] = regla.validar(reglaEn([placa(), ram({}, 3)]), {});
    expect(r?.mensaje).toContain('6 módulos');
    expect(r?.mensaje).toContain('máximo 4');
  });
  it('varios motivos a la vez dan varios rechazos con el mismo código', () => {
    const rechazos = regla.validar(
      reglaEn([placa({ velocidadRamMaxMhz: 5600 }), ram({ tipoRam: 'DDR4' }, 3)]),
      {},
    );
    expect(rechazos.map((r) => r.codigo)).toEqual(['RAM', 'RAM', 'RAM']);
  });
  it('placa sin velocidad máxima (datos antiguos): no evalúa la velocidad', () => {
    const antigua = { ...placa().atributos };
    delete antigua.velocidadRamMaxMhz;
    const vieja = pieza('PLACA_MADRE', 'Antigua', antigua);
    expect(regla.validar(reglaEn([vieja, ram({ velocidadRam: 9000 })]), {})).toEqual([]);
  });
  it('sin memorias: no evalúa', () => {
    expect(regla.validar(reglaEn([placa()]), {})).toEqual([]);
  });
});

describe('POTENCIA', () => {
  const regla: Regla = new ReglaPotencia();
  const params = { margenPorcentaje: 20, consumoBaseW: 0 };
  it('125 W + 263 W con 20 %: 466 W frente a 400 W → rechazo', () => {
    const [r] = regla.validar(
      reglaEn([cpu({ potenciaConsumidaW: 125 }), gpu(), fuente(400)]),
      params,
    );
    expect(r?.codigo).toBe('POTENCIA');
    expect(r?.mensaje).toContain('466 W');
    expect(r?.mensaje).toContain('400 W');
  });
  it('dentro del margen: aprobado', () => {
    expect(regla.validar(reglaEn([cpu(), gpu(), fuente(550)]), params)).toEqual([]);
  });
  it('el margen configurado (30 %) cambia el cálculo', () => {
    // 65 + 263 = 328; con 20 % = 394 (cabe en 400); con 30 % = 427 (no cabe).
    const piezas = [cpu(), gpu(), fuente(400)];
    expect(regla.validar(reglaEn(piezas), params)).toEqual([]);
    const [r] = regla.validar(reglaEn(piezas), { ...params, margenPorcentaje: 30 });
    expect(r?.mensaje).toContain('427 W');
  });
  it('el consumo base se suma antes del margen', () => {
    const [r] = regla.validar(reglaEn([cpu(), gpu(), fuente(400)]), {
      margenPorcentaje: 20,
      consumoBaseW: 50,
    });
    expect(r?.mensaje).toContain('454 W'); // (328 + 50) × 1,2 = 453,6
  });
  it('sin fuente: no evalúa', () => {
    expect(regla.validar(reglaEn([cpu(), gpu()]), params)).toEqual([]);
  });
});

describe('DIMENSIONES', () => {
  const regla: Regla = new ReglaDimensiones();
  it('GPU de 320 mm en gabinete de 300 mm: rechazo con ambas medidas', () => {
    const [r] = regla.validar(reglaEn([gpu(), gabinete({ largoGpuMaxMm: 300 })]), {});
    expect(r?.codigo).toBe('DIMENSIONES');
    expect(r?.mensaje).toContain('320 mm');
    expect(r?.mensaje).toContain('300 mm');
  });
  it('disipador de 170 mm en gabinete de 160 mm: rechazo por el disipador', () => {
    const [r] = regla.validar(
      reglaEn([cpu({ altoDisipadorMm: 170 }), gabinete({ altoDisipadorMaxMm: 160 })]),
      {},
    );
    expect(r?.mensaje).toContain('disipador');
    expect(r?.mensaje).toContain('170 mm');
  });
  it('procesador sin alto de disipador: no evalúa el disipador', () => {
    expect(regla.validar(reglaEn([cpu(), gabinete({ altoDisipadorMaxMm: 1 })]), {})).toEqual([]);
  });
  it('GPU y disipador fuera de medida a la vez: dos rechazos', () => {
    const r = regla.validar(
      reglaEn([
        gpu(),
        cpu({ altoDisipadorMm: 170 }),
        gabinete({ largoGpuMaxMm: 300, altoDisipadorMaxMm: 160 }),
      ]),
      {},
    );
    expect(r).toHaveLength(2);
  });
});

describe('FACTOR_FORMA', () => {
  const regla: Regla = new ReglaFactorForma();
  it('placa ATX en gabinete mATX/ITX: rechazo', () => {
    const [r] = regla.validar(
      reglaEn([placa(), gabinete({ factoresFormaSoportados: ['mATX', 'ITX'] })]),
      {},
    );
    expect(r?.codigo).toBe('FACTOR_FORMA');
    expect(r?.mensaje).toContain('ATX');
    expect(r?.mensaje).toContain('mATX, ITX');
  });
  it('factor admitido sin distinguir mayúsculas: aprobado', () => {
    expect(regla.validar(reglaEn([placa({ factorForma: 'atx' }), gabinete()]), {})).toEqual([]);
  });
});

describe('ALMACENAMIENTO', () => {
  const regla: Regla = new ReglaAlmacenamiento();
  it('unidad M.2 en placa solo SATA: rechazo que nombra la unidad y la interfaz', () => {
    const [r, ...resto] = regla.validar(
      reglaEn([placa({ interfacesAlmacenamiento: ['SATA'] }), disco('M.2'), disco('SATA')]),
      {},
    );
    expect(resto).toEqual([]);
    expect(r?.codigo).toBe('ALMACENAMIENTO');
    expect(r?.mensaje).toContain('SSD M.2');
    expect(r?.mensaje).toContain('M.2');
  });
});

describe('orquestador', () => {
  const activas: ConfigRegla[] = CODIGOS_REGLA.map((codigo) => ({
    codigo,
    activa: true,
    parametros: codigo === 'POTENCIA' ? { margenPorcentaje: 20, consumoBaseW: 0 } : {},
  }));

  it('configuración completa y compatible: sin rechazos', () => {
    const r = evaluar(
      [cpu(), placa(), ram(), gpu(), fuente(750), gabinete(), disco('M.2')],
      activas,
    );
    expect(r).toEqual({ compatible: true, rechazos: [] });
  });

  it('una pieza suelta: compatible', () => {
    expect(evaluar([cpu({ socket: 'LGA1700' })], activas).compatible).toBe(true);
  });

  it('junta rechazos de varias reglas en orden fijo', () => {
    const r = evaluar(
      [
        cpu({ socket: 'LGA1700', potenciaConsumidaW: 125 }),
        placa(),
        gpu(),
        fuente(400),
        gabinete({ factoresFormaSoportados: ['ITX'] }),
      ],
      activas,
    );
    expect(r.compatible).toBe(false);
    expect(r.rechazos.map((x) => x.codigo)).toEqual(['SOCKET', 'POTENCIA', 'FACTOR_FORMA']);
  });

  it('una regla inactiva no se evalúa', () => {
    const sinSocket = activas.map((c) => (c.codigo === 'SOCKET' ? { ...c, activa: false } : c));
    expect(evaluar([cpu({ socket: 'LGA1700' }), placa()], sinSocket).compatible).toBe(true);
  });

  it('una regla sin fila en la base se evalúa con sus parámetros por defecto', () => {
    const r = evaluar([cpu({ potenciaConsumidaW: 125 }), gpu(), fuente(400)], []);
    expect(r.rechazos[0]?.mensaje).toContain('466 W'); // margen por defecto: 20 %
  });

  it('los parámetros de la base reemplazan los por defecto', () => {
    const margen30 = activas.map((c) =>
      c.codigo === 'POTENCIA' ? { ...c, parametros: { margenPorcentaje: 30 } } : c,
    );
    expect(evaluar([cpu(), gpu(), fuente(400)], margen30).compatible).toBe(false);
    expect(evaluar([cpu(), gpu(), fuente(400)], activas).compatible).toBe(true);
  });
});
