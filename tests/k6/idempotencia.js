// HU-37b: reintentos de pago con la misma Idempotency-Key no duplican compras (spec
// pruebas-carga). Cada cliente reserva su unidad y envía 5 confirmaciones simultáneas con su
// clave: todas deben devolver la misma orden. Prepara: preparar.mjs --escenario idempotencia.
//
// Uso: k6 run tests/k6/idempotencia.js   (luego: node tests/k6/verificar.mjs)
import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { Counter, Trend } from 'k6/metrics';
import { API, datos, enviar, resumen } from './comun.js';

const REINTENTOS = 5;
const ordenesUnicas = new Counter('ordenes_unicas');
const duplicadas = new Counter('ordenes_duplicadas');
const otras = new Counter('respuestas_inesperadas');
const espera = new Trend('espera_pago', true);

export const options = {
  scenarios: {
    pagos: {
      executor: 'per-vu-iterations',
      vus: datos.cookies.length,
      iterations: 1,
      maxDuration: '2m',
    },
  },
  thresholds: {
    ordenes_unicas: [`count==${datos.cookies.length}`],
    ordenes_duplicadas: ['count==0'],
    respuestas_inesperadas: ['count==0'],
  },
};

const TARJETA = {
  numero: '4242424242424242',
  vencimiento: '12/30',
  cvv: '123',
  titular: 'K6 Prueba',
};

export default function () {
  const i = exec.scenario.iterationInTest;
  const cookie = datos.cookies[i];
  const reserva = enviar('/reservas', null, { cookie }, 'POST /reservas');
  if (reserva.status !== 201) {
    otras.add(1);
    return;
  }
  const reservaId = JSON.parse(reserva.body).id;
  const clave = `${datos.corrida}-${i}`;
  const peticion = {
    method: 'POST',
    url: `${API}/pagos/confirmar`,
    body: JSON.stringify({ reservaId, tarjeta: TARJETA }),
    params: {
      headers: { 'content-type': 'application/json', cookie, 'idempotency-key': clave },
      tags: { nombre: 'POST /pagos/confirmar' },
    },
  };
  // Los 5 reintentos salen a la vez (http.batch abre conexiones en paralelo).
  const respuestas = http.batch(Array.from({ length: REINTENTOS }, () => peticion));
  for (const r of respuestas) espera.add(r.timings.duration);
  const ok = respuestas.every((r) => r.status === 201);
  if (!ok) {
    otras.add(1);
    console.warn(`cliente ${i}: estados ${respuestas.map((r) => r.status).join(', ')}`);
    return;
  }
  const ids = new Set(respuestas.map((r) => JSON.parse(r.body).id));
  if (ids.size === 1) ordenesUnicas.add(1);
  else duplicadas.add(1);
  check(ids, { 'una sola orden por clave': (s) => s.size === 1 });
}

export const handleSummary = resumen(
  'idempotencia',
  ['ordenes_unicas', 'ordenes_duplicadas', 'respuestas_inesperadas'],
  'espera_pago',
);
