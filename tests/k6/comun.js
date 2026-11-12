// Utilidades compartidas por los escenarios de k6 (spec pruebas-carga, design D7 del Sprint 6).
import http from 'k6/http';
import { sleep } from 'k6';

export const datos = JSON.parse(open('./datos.json'));
export const API = __ENV.API_URL || datos.api;
export const ENTORNO =
  __ENV.ENTORNO || (/localhost|127\.0\.0\.1/.test(API) ? 'local' : 'produccion');

/** POST con hasta 3 intentos solo si no hubo respuesta (estado 0); una respuesta nunca se repite. */
export function enviar(ruta, cuerpo, cabeceras, nombre) {
  let res;
  for (let intento = 0; intento < 3; intento++) {
    res = http.post(`${API}${ruta}`, cuerpo === null ? null : JSON.stringify(cuerpo), {
      headers: { 'content-type': 'application/json', ...cabeceras },
      tags: { nombre },
    });
    if (res.status !== 0) break;
    sleep(0.2 * (intento + 1));
  }
  return res;
}

export const disponible = (productoId) =>
  JSON.parse(http.get(`${API}/productos/${productoId}`).body).disponible;

/** Dispara un Cron Trigger en `wrangler dev --test-scheduled` (solo local). */
export function disparar(cron) {
  return http.get(`${API}/__scheduled?cron=${encodeURIComponent(cron)}`);
}

const latencias = (m) =>
  m && {
    p50: m.values.med,
    p90: m.values['p(90)'],
    p95: m.values['p(95)'],
    max: m.values.max,
  };

/**
 * handleSummary común: guarda en tests/k6/resultados/ un JSON con el escenario, la fecha, el
 * entorno, los conteos de los contadores indicados y las latencias (sin cookies ni secretos).
 */
export function resumen(escenario, contadores, tendencia) {
  return (data) => {
    const conteos = Object.fromEntries(
      contadores.map((c) => [
        c,
        data.metrics[c]?.values.count ?? data.metrics[c]?.values.value ?? 0,
      ]),
    );
    const fallaron = Object.entries(data.metrics)
      .filter(([, m]) => m.thresholds && Object.values(m.thresholds).some((t) => !t.ok))
      .map(([nombre]) => nombre);
    const salida = {
      escenario,
      fecha: new Date().toISOString(),
      entorno: ENTORNO,
      conteos,
      latenciaMs: latencias(data.metrics[tendencia]),
      umbrales: fallaron.length ? { ok: false, fallaron } : { ok: true },
    };
    const fecha = salida.fecha.slice(0, 19).replace(/[:T]/g, '-');
    return {
      [`${__ENV.K6_RESULTADOS || 'tests/k6/resultados'}/${escenario}-${ENTORNO}-${fecha}.json`]:
        JSON.stringify(salida, null, 2),
      stdout: `\n${JSON.stringify(salida, null, 2)}\n`,
    };
  };
}
