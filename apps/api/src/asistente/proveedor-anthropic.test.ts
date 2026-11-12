// Adaptador de Claude por AI Gateway (tarea 2.4 del Sprint 5) con un fetch simulado: sin red.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CATALOGO_EJEMPLO } from '../../scripts/semillas';
import type { CategoriaPieza } from '../compatibilidad/motor/tipos';
import { preseleccionar } from './preseleccion';
import { ProveedorAnthropic } from './proveedor-anthropic';
import type { SolicitudIA } from './proveedor';
import { aCentimos, type ProductoAsistente } from './tipos';

const GATEWAY = 'https://gateway.ai.cloudflare.com/v1/cuenta-prueba/xdtech-ia/anthropic';
const TOKEN = 'token-secreto-de-prueba';

const catalogo: ProductoAsistente[] = CATALOGO_EJEMPLO.filter(
  (p) => p.categoria !== 'EQUIPO_ARMADO',
).map((p) => ({
  id: p.id,
  nombre: p.nombre,
  marca: p.marca,
  categoria: p.categoria as CategoriaPieza,
  precioCent: aCentimos(p.precio),
  atributos: p.atributos,
  disponible: p.stock,
}));
const solicitud: SolicitudIA = {
  presupuesto: '6000.00',
  uso: 'GAMING',
  candidatos: preseleccionar(catalogo, aCentimos(6000), 'GAMING'),
};
const respuestaValida = {
  componentes: Array.from({ length: 7 }, (_, i) => ({
    alias: `C${i + 1}`,
    cantidad: 1,
    explicacion: 'Buena opción.',
  })),
  resumen: 'Resumen',
};

function mensaje(cuerpo: unknown, stop = 'end_turn') {
  return {
    id: 'msg_prueba',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text: JSON.stringify(cuerpo) }],
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 1200, output_tokens: 300 },
  };
}

const json = (estado: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json' },
  });

function proveedor(fetchFalso: typeof fetch, config: { url?: string; token?: string } = {}) {
  return new ProveedorAnthropic(() => ({
    gatewayUrl: 'url' in config ? config.url : GATEWAY,
    token: 'token' in config ? config.token : TOKEN,
    modelo: 'claude-opus-5-5',
    fetch: fetchFalso,
  }));
}

afterEach(() => vi.restoreAllMocks());

describe('ProveedorAnthropic por AI Gateway', () => {
  it('llama al gateway con cf-aig-authorization, sin x-api-key, y pide salida estructurada', async () => {
    const llamadas: { url: string; init: RequestInit }[] = [];
    const fetchFalso = (async (url: string, init: RequestInit) => {
      llamadas.push({ url: String(url), init });
      return json(200, mensaje(respuestaValida));
    }) as unknown as typeof fetch;
    const r = await proveedor(fetchFalso).recomendar(solicitud, { timeoutMs: 5000 });
    expect(r).toEqual({
      tipo: 'respuesta',
      respuesta: respuestaValida,
      tokens: { entrada: 1200, salida: 300 },
    });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]!.url).toBe(`${GATEWAY}/v1/messages`);
    const h = new Headers(llamadas[0]!.init.headers);
    expect(h.get('cf-aig-authorization')).toBe(`Bearer ${TOKEN}`);
    expect(h.get('x-api-key')).toBeNull();
    const cuerpo = JSON.parse(String(llamadas[0]!.init.body));
    expect(cuerpo.model).toBe('claude-opus-5-5');
    expect(cuerpo.output_config.effort).toBe('low');
    expect(cuerpo.output_config.format.type).toBe('json_schema');
    expect(cuerpo.system).toMatch(/XDTech/);
    expect(cuerpo.messages[0].content).toMatch(/"alias":"C1"/);
  });

  it('en el reintento envía la respuesta anterior y los motivos', async () => {
    let cuerpo: { messages: { role: string; content: string }[] } | undefined;
    const fetchFalso = (async (_u: string, init: RequestInit) => {
      cuerpo = JSON.parse(String(init.body));
      return json(200, mensaje(respuestaValida));
    }) as unknown as typeof fetch;
    await proveedor(fetchFalso).recomendar(
      { ...solicitud, previa: { respuesta: { x: 1 }, motivos: ['Falta fuente.'] } },
      { timeoutMs: 5000 },
    );
    expect(cuerpo!.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(cuerpo!.messages[2]!.content).toMatch(/Falta fuente/);
  });

  it('sin URL o sin token no llama a la red', async () => {
    const fetchFalso = vi.fn() as unknown as typeof fetch;
    expect(
      await proveedor(fetchFalso, { url: undefined }).recomendar(solicitud, { timeoutMs: 100 }),
    ).toEqual({
      tipo: 'fallo',
      motivo: 'IA_SIN_CONFIGURAR',
    });
    expect(
      await proveedor(fetchFalso, { token: '' }).recomendar(solicitud, { timeoutMs: 100 }),
    ).toEqual({
      tipo: 'fallo',
      motivo: 'IA_SIN_CONFIGURAR',
    });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'IA_SIN_AUTORIZACION'],
    [429, 'IA_NO_DISPONIBLE'],
    [500, 'IA_NO_DISPONIBLE'],
  ])('HTTP %i del gateway: %s, sin el token en los logs', async (estado, motivo) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFalso = (async () =>
      json(estado, {
        type: 'error',
        error: { type: 'x', message: 'falló' },
      })) as unknown as typeof fetch;
    expect(await proveedor(fetchFalso).recomendar(solicitud, { timeoutMs: 5000 })).toEqual({
      tipo: 'fallo',
      motivo,
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain(TOKEN);
  });

  it('timeout: IA_TIMEOUT', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFalso = ((_u: string, init: RequestInit) =>
      new Promise((_, rechazar) => {
        init.signal?.addEventListener('abort', () =>
          rechazar(new DOMException('abort', 'AbortError')),
        );
      })) as unknown as typeof fetch;
    const r = await proveedor(fetchFalso).recomendar(solicitud, { timeoutMs: 50 });
    expect(r).toEqual({ tipo: 'fallo', motivo: 'IA_TIMEOUT' });
  });

  it('rechazo del modelo: IA_RECHAZO', async () => {
    const fetchFalso = (async () =>
      json(200, {
        ...mensaje(respuestaValida, 'refusal'),
        content: [],
      })) as unknown as typeof fetch;
    expect(await proveedor(fetchFalso).recomendar(solicitud, { timeoutMs: 5000 })).toEqual({
      tipo: 'fallo',
      motivo: 'IA_RECHAZO',
    });
  });

  it('ignora el escenario del simulado', async () => {
    const fetchFalso = (async () => json(200, mensaje(respuestaValida))) as unknown as typeof fetch;
    const r = await proveedor(fetchFalso).recomendar(solicitud, {
      timeoutMs: 5000,
      escenario: 'caida',
    });
    expect(r.tipo).toBe('respuesta');
  });
});
