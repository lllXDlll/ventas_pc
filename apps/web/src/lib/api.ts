// URL pública de la API, fijada en tiempo de compilación (design.md, sección 2.6 de la arquitectura).
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

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

/**
 * Llamada desde el navegador, con la cookie de sesión (`credentials: 'include'`).
 * `api.xdtech.store` es el mismo sitio que `xdtech.store`, así que la cookie
 * SameSite=Lax viaja con la petición.
 */
export async function api<T>(
  ruta: string,
  opciones: { metodo?: string; cuerpo?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${ruta}`, {
      method: opciones.metodo ?? 'GET',
      credentials: 'include',
      headers: opciones.cuerpo === undefined ? undefined : { 'content-type': 'application/json' },
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
    });
  } catch {
    throw new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con la API. Revisa tu conexión.');
  }
  if (!res.ok) throw await leerError(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Llamada desde el render en servidor (datos públicos, sin cookie), con tiempo límite. */
export async function apiServidor<T>(ruta: string): Promise<T> {
  const res = await fetch(`${API_URL}${ruta}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw await leerError(res);
  return (await res.json()) as T;
}

// Tipos de las respuestas de la API (spec catalogo y autenticacion).
export interface Usuario {
  id: string;
  correo: string;
  rol: 'CLIENTE' | 'ADMIN';
}

export interface Categoria {
  codigo: string;
  nombre: string;
}

export interface Producto {
  id: string;
  nombre: string;
  categoria: Categoria;
  tipo: 'COMPONENTE' | 'EQUIPO';
  precio: string;
  disponible: number;
  agotado: boolean;
  atributos: Record<string, unknown>;
}

export interface ProductoAdmin extends Producto {
  activo: boolean;
  stock: { cantidad: number; version: number };
}

export interface Pagina<T> {
  productos: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

export function formatoPrecio(precio: string): string {
  return `S/ ${Number(precio).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
