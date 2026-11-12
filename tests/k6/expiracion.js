// HU-37b: con TTL corto, las reservas no pagadas se liberan y una segunda oleada adquiere esas
// unidades (spec pruebas-carga). Solo en local: `wrangler dev --test-scheduled` con
// RESERVA_TTL_MIN=1 (design D7). Prepara: preparar.mjs --escenario expiracion (5 + 50).
//
// Uso: k6 run tests/k6/expiracion.js   (luego: node tests/k6/verificar.mjs)
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Gauge, Trend } from 'k6/metrics';
import { datos, disparar, disponible, enviar, resumen } from './comun.js';

const PRIMERA = datos.unidades;
const SEGUNDA = datos.cookies.length - PRIMERA;
const primera = new Counter('reservas_primera_oleada');
const segunda = new Counter('reservas_segunda_oleada');
const otras = new Counter('respuestas_inesperadas');
const liberado = new Gauge('disponible_tras_expirar');
const espera = new Trend('espera_reserva', true);

export const options = {
  scenarios: {
    primera: { executor: 'per-vu-iterations', vus: PRIMERA, iterations: 1, exec: 'oleada1' },
    // TTL de 1 minuto: se espera a que venzan y se dispara la expiración.
    expirar: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      exec: 'expirar',
      startTime: '5s',
    },
    segunda: {
      executor: 'per-vu-iterations',
      vus: SEGUNDA,
      iterations: 1,
      exec: 'oleada2',
      startTime: '80s',
    },
  },
  thresholds: {
    reservas_primera_oleada: [`count==${PRIMERA}`],
    reservas_segunda_oleada: [`count==${PRIMERA}`],
    disponible_tras_expirar: [`value==${PRIMERA}`],
    respuestas_inesperadas: ['count==0'],
  },
};

function reservar(indice, contador) {
  const res = enviar('/reservas', null, { cookie: datos.cookies[indice] }, 'POST /reservas');
  espera.add(res.timings.duration);
  if (res.status === 201) contador.add(1);
  else if (res.status !== 409) otras.add(1);
}

export function oleada1() {
  reservar(exec.scenario.iterationInTest, primera);
}

export function expirar() {
  check(disponible(datos.productoId), { 'agotado tras la 1.ª oleada': (d) => d === 0 });
  sleep(65);
  const r = disparar('* * * * *');
  check(r, { 'expiración disparada': (x) => x.status === 200 });
  sleep(2);
  liberado.add(disponible(datos.productoId));
}

export function oleada2() {
  reservar(PRIMERA + exec.scenario.iterationInTest, segunda);
}

export const handleSummary = resumen(
  'expiracion',
  [
    'reservas_primera_oleada',
    'reservas_segunda_oleada',
    'disponible_tras_expirar',
    'respuestas_inesperadas',
  ],
  'espera_reserva',
);
