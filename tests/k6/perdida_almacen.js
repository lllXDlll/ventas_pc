// HU-37b: tras vaciar el almacenamiento del Durable Object Inventario, la reconstrucción y la
// reconciliación restauran el disponible correcto (spec pruebas-carga y disponibilidad).
// Solo en local: `wrangler dev --test-scheduled` con PRUEBAS_HABILITADAS=true (design D6 y D7).
// Prepara: preparar.mjs --escenario perdida (2 + 50 clientes y un ADMIN).
//
// Uso: k6 run tests/k6/perdida_almacen.js   (luego: node tests/k6/verificar.mjs)
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Gauge, Trend } from 'k6/metrics';
import { datos, disparar, disponible, enviar, resumen } from './comun.js';

const INICIALES = 2;
const OLEADA = datos.cookies.length - INICIALES;
const QUEDAN = datos.unidades - INICIALES;
const iniciales = new Counter('reservas_iniciales');
const oleada = new Counter('reservas_tras_perdida');
const otras = new Counter('respuestas_inesperadas');
const perezosa = new Gauge('disponible_reconstruccion_perezosa');
const reconciliado = new Gauge('disponible_tras_reconciliar');
const espera = new Trend('espera_reserva', true);

export const options = {
  scenarios: {
    iniciales: {
      executor: 'per-vu-iterations',
      vus: INICIALES,
      iterations: 1,
      exec: 'reservasIniciales',
    },
    perdida: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      exec: 'perdida',
      startTime: '5s',
    },
    oleada: {
      executor: 'per-vu-iterations',
      vus: OLEADA,
      iterations: 1,
      exec: 'oleadaFinal',
      startTime: '15s',
    },
  },
  thresholds: {
    reservas_iniciales: [`count==${INICIALES}`],
    disponible_reconstruccion_perezosa: [`value==${QUEDAN}`],
    disponible_tras_reconciliar: [`value==${QUEDAN}`],
    reservas_tras_perdida: [`count==${QUEDAN}`],
    respuestas_inesperadas: ['count==0'],
  },
};

function reservar(indice, contador) {
  const res = enviar('/reservas', null, { cookie: datos.cookies[indice] }, 'POST /reservas');
  espera.add(res.timings.duration);
  if (res.status === 201) contador.add(1);
  else if (res.status !== 409) otras.add(1);
}

export function reservasIniciales() {
  reservar(exec.scenario.iterationInTest, iniciales);
}

const vaciar = () => {
  const r = enviar(
    '/pruebas/inventario/vaciar',
    null,
    { cookie: datos.admin },
    'POST /pruebas/inventario/vaciar',
  );
  check(r, { 'almacén vaciado': (x) => x.status === 200 });
};

export function perdida() {
  // 1. Vaciar y leer: la reconstrucción perezosa usa físico − reservas ACTIVA de Postgres.
  vaciar();
  perezosa.add(disponible(datos.productoId));
  // 2. Vaciar otra vez y reconciliar antes de leer (lo que corregía mal antes del Sprint 6).
  vaciar();
  check(disparar('*/5 * * * *'), { 'reconciliación disparada': (x) => x.status === 200 });
  sleep(2);
  reconciliado.add(disponible(datos.productoId));
}

export function oleadaFinal() {
  reservar(INICIALES + exec.scenario.iterationInTest, oleada);
}

export const handleSummary = resumen(
  'perdida',
  [
    'reservas_iniciales',
    'disponible_reconstruccion_perezosa',
    'disponible_tras_reconciliar',
    'reservas_tras_perdida',
    'respuestas_inesperadas',
  ],
  'espera_reserva',
);
