// Reparto del presupuesto por uso (design D2 del Sprint 5): guía la preselección y el
// armador determinístico. Cada fila suma 1.
import type { CategoriaPieza } from '../compatibilidad/motor/tipos';
import type { Uso } from './tipos';

type Reparto = Record<CategoriaPieza, number>;

const GENERAL: Reparto = {
  PROCESADOR: 0.28,
  TARJETA_GRAFICA: 0.14,
  PLACA_MADRE: 0.16,
  RAM: 0.12,
  ALMACENAMIENTO: 0.12,
  FUENTE: 0.1,
  GABINETE: 0.08,
};

export const REPARTO: Record<Uso, Reparto> = {
  GAMING: {
    PROCESADOR: 0.2,
    TARJETA_GRAFICA: 0.4,
    PLACA_MADRE: 0.12,
    RAM: 0.09,
    ALMACENAMIENTO: 0.07,
    FUENTE: 0.07,
    GABINETE: 0.05,
  },
  DISENO: {
    PROCESADOR: 0.26,
    TARJETA_GRAFICA: 0.3,
    PLACA_MADRE: 0.12,
    RAM: 0.12,
    ALMACENAMIENTO: 0.08,
    FUENTE: 0.07,
    GABINETE: 0.05,
  },
  OFICINA: GENERAL,
  ESTUDIO: GENERAL,
  OTRO: {
    PROCESADOR: 0.24,
    TARJETA_GRAFICA: 0.26,
    PLACA_MADRE: 0.14,
    RAM: 0.11,
    ALMACENAMIENTO: 0.09,
    FUENTE: 0.09,
    GABINETE: 0.07,
  },
};

/** Objetivo en céntimos para una categoría. */
export const objetivo = (presupuestoCent: number, uso: Uso, categoria: CategoriaPieza) =>
  Math.round(presupuestoCent * REPARTO[uso][categoria]);
