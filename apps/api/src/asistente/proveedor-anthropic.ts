// Adaptador de Claude por AI Gateway de Cloudflare (spec asistente, design D3 del Sprint 5).
// La clave de Anthropic está guardada en el gateway: aquí solo viajan la URL y el token del
// gateway, que nunca se registran.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { RespuestaSchema } from './esquema';
import { mensajes, SISTEMA } from './prompt';
import type { MotivoFallo, OpcionesIA, ProveedorIA, ResultadoIA, SolicitudIA } from './proveedor';

export interface ConfigAnthropic {
  gatewayUrl?: string;
  token?: string;
  modelo: string;
  /** Solo para pruebas: reemplaza el fetch del SDK. */
  fetch?: typeof fetch;
}

const MAX_TOKENS = 4000;

const log = (motivo: MotivoFallo, detalle: string) =>
  console.error(JSON.stringify({ nivel: 'error', mensaje: 'IA sin respuesta', motivo, detalle }));

/** Mapea los errores tipados del SDK a motivos de respaldo (design D3). */
export function motivoDeError(e: unknown): MotivoFallo {
  if (e instanceof Anthropic.APIConnectionTimeoutError) return 'IA_TIMEOUT';
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return 'IA_SIN_AUTORIZACION';
  }
  return 'IA_NO_DISPONIBLE';
}

export class ProveedorAnthropic implements ProveedorIA {
  private cliente: Anthropic | undefined;
  private clave = '';

  constructor(private readonly config: () => ConfigAnthropic) {}

  /** Un cliente por isolate mientras no cambien la URL ni el token. */
  private clienteDe(c: ConfigAnthropic & { gatewayUrl: string; token: string }) {
    const clave = `${c.gatewayUrl}\u0000${c.token}`;
    if (!this.cliente || this.clave !== clave) {
      this.cliente = new Anthropic({
        baseURL: c.gatewayUrl,
        apiKey: 'byok', // relleno: la clave real está guardada en el gateway
        defaultHeaders: { 'x-api-key': null, 'cf-aig-authorization': `Bearer ${c.token}` },
        maxRetries: 0, // el orquestador hace el único reintento
        ...(c.fetch ? { fetch: c.fetch } : {}),
      });
      this.clave = clave;
    }
    return this.cliente;
  }

  async recomendar(s: SolicitudIA, { timeoutMs }: OpcionesIA): Promise<ResultadoIA> {
    const c = this.config();
    if (!c.gatewayUrl || !c.token) return { tipo: 'fallo', motivo: 'IA_SIN_CONFIGURAR' };
    const cliente = this.clienteDe({ ...c, gatewayUrl: c.gatewayUrl, token: c.token });
    try {
      const r = await cliente.messages.parse(
        {
          model: c.modelo,
          max_tokens: MAX_TOKENS,
          output_config: { format: zodOutputFormat(RespuestaSchema), effort: 'low' },
          system: SISTEMA,
          messages: mensajes(s),
        },
        { timeout: timeoutMs },
      );
      const tokens = { entrada: r.usage.input_tokens, salida: r.usage.output_tokens };
      if (r.stop_reason === 'refusal') return { tipo: 'fallo', motivo: 'IA_RECHAZO' };
      // max_tokens o un JSON que no cumple: la validación lo marca inválido y se reintenta.
      return { tipo: 'respuesta', respuesta: r.parsed_output ?? null, tokens };
    } catch (e) {
      if (e instanceof Anthropic.APIError || e instanceof Error) {
        const motivo = motivoDeError(e);
        // Solo el tipo y el estado: nunca encabezados (llevan el token del gateway).
        const estado = e instanceof Anthropic.APIError ? String(e.status ?? '') : '';
        log(motivo, `${e.constructor.name} ${estado}`.trim());
        // Un JSON que el SDK no pudo parsear no es un fallo de la IA: se reintenta.
        if (!(e instanceof Anthropic.APIError) && /JSON|parse/i.test(e.message)) {
          return { tipo: 'respuesta', respuesta: null };
        }
        return { tipo: 'fallo', motivo };
      }
      throw e;
    }
  }
}
