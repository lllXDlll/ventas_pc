// Prueba 4 de HU-36b: N reservas HTTP concurrentes sobre un componente con
// stock limitado, a través del Worker completo (NestJS → Durable Object).
//
// Uso (Node 24 ejecuta TypeScript directamente):
//   node tests/prototipos/reservas-300.ts --url http://127.0.0.1:8787 --token <PROTOTIPO_TOKEN>
// Opciones: --usuarios 300  --stock 5
//
// Criterio de aceptación: exactamente `stock` reservas exitosas y disponible final 0.
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://127.0.0.1:8787' },
    token: { type: 'string', default: process.env.PROTOTIPO_TOKEN ?? '' },
    usuarios: { type: 'string', default: '300' },
    stock: { type: 'string', default: '5' },
  },
});

const base = values.url.replace(/\/$/, '');
const usuarios = Number(values.usuarios);
const stock = Number(values.stock);
const instancia = `carga-${Date.now()}`;
const productoId = 'gpu-limitada';
const cabeceras = { 'content-type': 'application/json', 'x-prototipo-token': values.token };

async function llamar<T>(ruta: string, cuerpo?: unknown): Promise<T> {
  const res = await fetch(`${base}${ruta}`, {
    method: cuerpo ? 'POST' : 'GET',
    headers: cabeceras,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (!res.ok) throw new Error(`${ruta} respondió ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

function percentil(valores: number[], p: number): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  return (
    ordenados[Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)] ?? 0
  );
}

interface Reserva {
  ok: boolean;
  motivo?: string;
  filasEscritas?: number;
  duracionMs: number;
}

await llamar('/__prototipo/inventario/preparar', { instancia, productoId, cantidad: stock });

const inicio = performance.now();
const resultados = await Promise.all(
  Array.from({ length: usuarios }, async () => {
    const t0 = performance.now();
    const r = await llamar<Reserva>('/__prototipo/inventario/reservar', {
      instancia,
      productoId,
      cantidad: 1,
    });
    return { ...r, latenciaMs: performance.now() - t0 };
  }),
);
const totalMs = performance.now() - inicio;

const { disponible } = await llamar<{ disponible: number | null }>(
  `/__prototipo/inventario/consultar?instancia=${instancia}&productoId=${productoId}`,
);

const exitosas = resultados.filter((r) => r.ok);
const latencias = resultados.map((r) => r.latenciaMs);
const enObjeto = resultados.map((r) => r.duracionMs);
const filas = exitosas.map((r) => r.filasEscritas ?? 0);
const motivos = Object.groupBy(resultados, (r) => (r.ok ? 'ok' : (r.motivo ?? 'desconocido')));

const informe = {
  destino: base,
  usuarios,
  stockInicial: stock,
  reservasExitosas: exitosas.length,
  disponibleFinal: disponible,
  porMotivo: Object.fromEntries(Object.entries(motivos).map(([k, v]) => [k, v?.length ?? 0])),
  latenciaClienteMs: {
    p50: +percentil(latencias, 50).toFixed(1),
    p95: +percentil(latencias, 95).toFixed(1),
    max: +Math.max(...latencias).toFixed(1),
  },
  esperaObjetoMs: { p50: percentil(enObjeto, 50), p95: percentil(enObjeto, 95) },
  filasEscritasPorReservaExitosa: filas[0] ?? null,
  duracionTotalMs: +totalMs.toFixed(0),
};
console.log(JSON.stringify(informe, null, 2));

const aceptado = exitosas.length === stock && disponible === 0;
console.log(aceptado ? '\nACEPTADO: sin sobreventa.' : '\nRECHAZADO: revisar resultados.');
process.exit(aceptado ? 0 : 1);
