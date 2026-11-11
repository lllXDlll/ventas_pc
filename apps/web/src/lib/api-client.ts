// Cliente HTTP de la API (design D4 del Sprint 1.5). La sesión es la cookie httpOnly
// `xd_sesion`: el cliente no maneja ningún token, solo envía la cookie.

import { API_URL } from './config';

export { API_URL };

/** Error de la API con su formato `{ codigo, mensaje, detalle? }`. */
export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    readonly codigo: string,
    mensaje: string,
    readonly detalle?: Record<string, unknown>,
  ) {
    super(mensaje);
  }
}

async function leerError(res: Response): Promise<ErrorApi> {
  try {
    const cuerpo = (await res.json()) as {
      codigo?: string;
      mensaje?: string;
      detalle?: Record<string, unknown>;
    };
    return new ErrorApi(
      res.status,
      cuerpo.codigo ?? 'ERROR',
      cuerpo.mensaje ?? `La API respondió ${res.status}.`,
      cuerpo.detalle,
    );
  } catch {
    return new ErrorApi(res.status, 'ERROR', `La API respondió ${res.status}.`);
  }
}

const EN_SERVIDOR = typeof window === 'undefined';

export interface OpcionesApi {
  metodo?: string;
  /** Se envía como JSON. */
  cuerpo?: unknown;
  /** Se envía tal cual (por ejemplo, el binario de una imagen). */
  archivo?: Blob;
}

/**
 * Llamada a la API. En el navegador envía la cookie de sesión (`api.xdtech.store` es el
 * mismo sitio que `xdtech.store`); en el render del servidor no hay cookie, no se cachea y
 * tiene tiempo límite para que una API caída no cuelgue la página.
 */
export async function api<T>(ruta: string, opciones: OpcionesApi = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (opciones.archivo) {
    headers['content-type'] = opciones.archivo.type || 'application/octet-stream';
    body = opciones.archivo;
  } else if (opciones.cuerpo !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opciones.cuerpo);
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${ruta}`, {
      method: opciones.metodo ?? 'GET',
      headers,
      body,
      ...(EN_SERVIDOR
        ? { cache: 'no-store' as const, signal: AbortSignal.timeout(5000) }
        : { credentials: 'include' as const }),
    });
  } catch {
    throw new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con la API. Revisa tu conexión.');
  }
  if (!res.ok) throw await leerError(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export function mensajeDeError(error: unknown, porDefecto = 'Ocurrió un error inesperado.') {
  return error instanceof ErrorApi ? error.message : porDefecto;
}
