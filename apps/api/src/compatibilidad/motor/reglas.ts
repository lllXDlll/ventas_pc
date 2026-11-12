// Las seis reglas del motor: una clase por regla con la misma interfaz (design D1 del
// Sprint 2). Cada una devuelve [] si es compatible o si le faltan las piezas que compara.
import { MENSAJES } from './mensajes';
import type { CodigoRegla } from './parametros';
import {
  type ConfiguracionEvaluable,
  entero,
  igual,
  lista,
  type Parametros,
  type Regla,
  type Rechazo,
  texto,
} from './tipos';

/** HU-09: socket del procesador igual al de la placa madre. */
export class ReglaSocket implements Regla {
  readonly codigo: CodigoRegla = 'SOCKET';
  validar({ procesador, placa }: ConfiguracionEvaluable): Rechazo[] {
    const sCpu = texto(procesador, 'socket');
    const sPlaca = texto(placa, 'socket');
    if (!procesador || !placa || !sCpu || !sPlaca || igual(sCpu, sPlaca)) return [];
    return [
      {
        codigo: this.codigo,
        mensaje: MENSAJES.socket(procesador.nombre, sCpu, placa.nombre, sPlaca),
        productos: [procesador.id, placa.id],
      },
    ];
  }
}

/** HU-10: tipo, velocidad y cantidad de módulos de RAM frente a la placa madre. */
export class ReglaRam implements Regla {
  readonly codigo: CodigoRegla = 'RAM';
  validar({ placa, ram }: ConfiguracionEvaluable): Rechazo[] {
    if (!placa || ram.length === 0) return [];
    const rechazos: Rechazo[] = [];
    const tPlaca = texto(placa, 'tipoRam');
    // Placas anteriores al Sprint 2 pueden no tener la velocidad máxima: no se evalúa.
    const vPlaca = entero(placa, 'velocidadRamMaxMhz');
    for (const m of ram) {
      const tRam = texto(m, 'tipoRam');
      if (tPlaca && tRam && !igual(tPlaca, tRam)) {
        rechazos.push({
          codigo: this.codigo,
          mensaje: MENSAJES.ramTipo(m.nombre, tRam, placa.nombre, tPlaca),
          productos: [m.id, placa.id],
        });
      }
      const vRam = entero(m, 'velocidadRam');
      if (vPlaca && vRam && vRam > vPlaca) {
        rechazos.push({
          codigo: this.codigo,
          mensaje: MENSAJES.ramVelocidad(m.nombre, vRam, placa.nombre, vPlaca),
          productos: [m.id, placa.id],
        });
      }
    }
    const max = entero(placa, 'maxModulosRam');
    const total = ram.reduce((s, m) => s + (entero(m, 'modulos') ?? 1) * m.cantidad, 0);
    if (max && total > max) {
      rechazos.push({
        codigo: this.codigo,
        mensaje: MENSAJES.ramModulos(total, placa.nombre, max),
        productos: [...ram.map((m) => m.id), placa.id],
      });
    }
    return rechazos;
  }
}

/** HU-11: consumo de procesador y GPU más base y margen, frente a la fuente. */
export class ReglaPotencia implements Regla {
  readonly codigo: CodigoRegla = 'POTENCIA';
  validar({ procesador, gpu, fuente }: ConfiguracionEvaluable, p: Parametros): Rechazo[] {
    const disponible = entero(fuente, 'potenciaEntregadaW');
    if (!fuente || !disponible || (!procesador && !gpu)) return [];
    const consumo =
      [procesador, gpu].reduce(
        (s, pieza) => s + (entero(pieza, 'potenciaConsumidaW') ?? 0) * (pieza?.cantidad ?? 0),
        0,
      ) + (p.consumoBaseW ?? 0);
    const margen = p.margenPorcentaje ?? 0;
    // Redondeo para evitar errores de coma flotante antes del techo: 388 × 1,2 = 465,6 → 466.
    const requerida = Math.ceil(Math.round(consumo * (100 + margen)) / 100);
    if (requerida <= disponible) return [];
    return [
      {
        codigo: this.codigo,
        mensaje: MENSAJES.potencia(requerida, margen, fuente.nombre, disponible),
        productos: [procesador?.id, gpu?.id, fuente.id].filter((x): x is string => Boolean(x)),
      },
    ];
  }
}

/** HU-12: largo de la GPU y, si se conoce, alto del disipador frente al gabinete. */
export class ReglaDimensiones implements Regla {
  readonly codigo: CodigoRegla = 'DIMENSIONES';
  validar({ gpu, procesador, gabinete }: ConfiguracionEvaluable): Rechazo[] {
    if (!gabinete) return [];
    const rechazos: Rechazo[] = [];
    const largo = entero(gpu, 'largoMm');
    const largoMax = entero(gabinete, 'largoGpuMaxMm');
    if (gpu && largo && largoMax && largo > largoMax) {
      rechazos.push({
        codigo: this.codigo,
        mensaje: MENSAJES.gpuLargo(gpu.nombre, largo, gabinete.nombre, largoMax),
        productos: [gpu.id, gabinete.id],
      });
    }
    const alto = entero(procesador, 'altoDisipadorMm');
    const altoMax = entero(gabinete, 'altoDisipadorMaxMm');
    if (procesador && alto && altoMax && alto > altoMax) {
      rechazos.push({
        codigo: this.codigo,
        mensaje: MENSAJES.disipadorAlto(procesador.nombre, alto, gabinete.nombre, altoMax),
        productos: [procesador.id, gabinete.id],
      });
    }
    return rechazos;
  }
}

/** HU-12: factor de forma de la placa madre entre los admitidos por el gabinete. */
export class ReglaFactorForma implements Regla {
  readonly codigo: CodigoRegla = 'FACTOR_FORMA';
  validar({ placa, gabinete }: ConfiguracionEvaluable): Rechazo[] {
    const ff = texto(placa, 'factorForma');
    const soportados = lista(gabinete, 'factoresFormaSoportados');
    if (!placa || !gabinete || !ff || soportados.length === 0) return [];
    if (soportados.some((s) => igual(s, ff))) return [];
    return [
      {
        codigo: this.codigo,
        mensaje: MENSAJES.factorForma(placa.nombre, ff, gabinete.nombre, soportados),
        productos: [placa.id, gabinete.id],
      },
    ];
  }
}

/** HU-12: interfaz de cada unidad de almacenamiento disponible en la placa madre. */
export class ReglaAlmacenamiento implements Regla {
  readonly codigo: CodigoRegla = 'ALMACENAMIENTO';
  validar({ placa, almacenamiento }: ConfiguracionEvaluable): Rechazo[] {
    const ofrecidas = lista(placa, 'interfacesAlmacenamiento');
    if (!placa || ofrecidas.length === 0) return [];
    return almacenamiento.flatMap((u) => {
      const interfaz = texto(u, 'interfaz');
      if (!interfaz || ofrecidas.some((o) => igual(o, interfaz))) return [];
      return [
        {
          codigo: this.codigo,
          mensaje: MENSAJES.almacenamiento(u.nombre, interfaz, placa.nombre, ofrecidas),
          productos: [u.id, placa.id],
        },
      ];
    });
  }
}

/** Orden fijo de evaluación (design D1). */
export const REGLAS: readonly Regla[] = [
  new ReglaSocket(),
  new ReglaRam(),
  new ReglaPotencia(),
  new ReglaDimensiones(),
  new ReglaFactorForma(),
  new ReglaAlmacenamiento(),
];
