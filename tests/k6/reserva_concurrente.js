// HU-37a: 300 usuarios virtuales intentan reservar a la vez 1 unidad de un producto con 5
// (spec reservas "Sin sobreventa bajo concurrencia"). Prepara los datos tests/k6/preparar.mjs.
//
// Uso: k6 run tests/k6/reserva_concurrente.js   (API_URL sobrescribe la de datos.json)
// El resumen queda en tests/k6/resultados/ (Sprint 6, spec pruebas-carga).
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import http from 'k6/http';
import { Counter, Trend } from 'k6/metrics';
import { resumen } from './comun.js';

const datos = JSON.parse(open('./datos.json'));
const cookies = new SharedArray('cookies', () => datos.cookies);
const API = __ENV.API_URL || datos.api;

const exitosas = new Counter('reservas_exitosas');
const sinStock = new Counter('reservas_sin_stock');
const otras = new Counter('respuestas_inesperadas');
const espera = new Trend('espera_reserva', true);

export const options = {
  scenarios: {
    reservas: {
      executor: 'per-vu-iterations',
      vus: cookies.length,
      iterations: 1,
      maxDuration: '2m',
    },
  },
  // La corrida falla si hay sobreventa (más éxitos que unidades) o respuestas inesperadas.
  thresholds: {
    reservas_exitosas: [`count==${datos.unidades}`],
    respuestas_inesperadas: ['count==0'],
  },
};

export default function () {
  // Solo se reintenta si no hubo respuesta (estado 0: conexión rechazada o cortada en el
  // cliente). Una respuesta de la API, sea 201 o 409, nunca se repite.
  let res;
  for (let intento = 0; intento < 3; intento++) {
    res = http.post(`${API}/reservas`, null, {
      headers: { cookie: cookies[__VU - 1] },
      tags: { nombre: 'POST /reservas' },
    });
    if (res.status !== 0) break;
    sleep(0.2 * (intento + 1));
  }
  espera.add(res.timings.duration);
  if (res.status === 201) exitosas.add(1);
  else if (res.status === 409) sinStock.add(1);
  else otras.add(1);
  check(res, { '201 o 409': (r) => r.status === 201 || r.status === 409 });
}

export const handleSummary = resumen(
  'concurrencia',
  ['reservas_exitosas', 'reservas_sin_stock', 'respuestas_inesperadas'],
  'espera_reserva',
);
