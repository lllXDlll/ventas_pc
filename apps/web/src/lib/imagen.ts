import { API_URL } from './config';

/** URL absoluta de una imagen de producto (la API devuelve la ruta relativa). */
export function urlImagen(ruta: string | null | undefined): string | null {
  return ruta ? `${API_URL}${ruta}` : null;
}
