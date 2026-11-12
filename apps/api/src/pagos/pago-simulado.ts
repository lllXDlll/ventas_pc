// Pago simulado con tarjetas de prueba (spec pagos, design D1 del Sprint 4). Función pura:
// sin E/S ni lectura del entorno, para probarla en Node.

export interface Tarjeta {
  numero: string;
  /** MM/AA */
  vencimiento: string;
  cvv: string;
  titular: string;
}

export type ResultadoPago = 'APROBADO' | 'RECHAZADO';

/** Tarjeta de prueba que siempre rechaza (como en las pasarelas en modo prueba). */
export const TARJETA_RECHAZADA = '4000000000000002';

export class TarjetaInvalida extends Error {}

export const soloDigitos = (numero: string) => numero.replace(/[\s-]/g, '');

/** Algoritmo de Luhn sobre un número de solo dígitos. */
export function cumpleLuhn(digitos: string): boolean {
  let suma = 0;
  for (let i = 0; i < digitos.length; i++) {
    let d = Number(digitos[digitos.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
  }
  return suma % 10 === 0;
}

/** Lanza TarjetaInvalida con un mensaje para el cliente si los datos no son válidos. */
export function validarTarjeta(t: Tarjeta, hoy = new Date()): void {
  const digitos = soloDigitos(t.numero);
  if (!/^\d{13,19}$/.test(digitos) || !cumpleLuhn(digitos)) {
    throw new TarjetaInvalida('El número de tarjeta no es válido.');
  }
  const v = /^(\d{2})\/(\d{2})$/.exec(t.vencimiento.trim());
  const mes = v ? Number(v[1]) : 0;
  if (!v || mes < 1 || mes > 12) {
    throw new TarjetaInvalida('El vencimiento debe tener el formato MM/AA.');
  }
  // Vence al terminar el mes indicado.
  const finDeMes = Date.UTC(2000 + Number(v[2]), mes, 1);
  if (finDeMes <= hoy.getTime()) throw new TarjetaInvalida('La tarjeta está vencida.');
  if (!/^\d{3,4}$/.test(t.cvv)) throw new TarjetaInvalida('El CVV debe tener 3 o 4 dígitos.');
  if (t.titular.trim().length === 0) throw new TarjetaInvalida('Falta el titular de la tarjeta.');
}

/**
 * Valida y decide: `forzar` (PAGO_SIMULADO_FORZAR) manda si vale APROBAR o RECHAZAR; si no,
 * la tarjeta de rechazo rechaza y cualquier otra válida aprueba.
 */
export function autorizar(t: Tarjeta, forzar = '', hoy = new Date()): ResultadoPago {
  validarTarjeta(t, hoy);
  if (forzar === 'APROBAR') return 'APROBADO';
  if (forzar === 'RECHAZAR') return 'RECHAZADO';
  return soloDigitos(t.numero) === TARJETA_RECHAZADA ? 'RECHAZADO' : 'APROBADO';
}

export const ultimos4 = (numero: string) => soloDigitos(numero).slice(-4);
