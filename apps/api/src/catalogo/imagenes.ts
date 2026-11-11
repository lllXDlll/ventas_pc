// Imágenes de producto (spec imagenes-producto, design D9 del Sprint 1.5): lógica pura.

export type ExtensionImagen = 'jpg' | 'png' | 'webp';

export const TIPO_CONTENIDO: Record<ExtensionImagen, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Tamaño máximo de una imagen: 2 MB. */
export const MAX_BYTES_IMAGEN = 2 * 1024 * 1024;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Tipo real de la imagen según sus bytes iniciales, sin fiarse del Content-Type.
 * JPEG: FF D8 FF. PNG: 89 50 4E 47 0D 0A 1A 0A. WebP: "RIFF" <tamaño> "WEBP".
 */
export function tipoImagen(bytes: Uint8Array): ExtensionImagen | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpg';
  }
  if (bytes.length >= 8 && PNG.every((b, i) => bytes[i] === b)) return 'png';
  const ascii = (desde: number, hasta: number) => String.fromCharCode(...bytes.slice(desde, hasta));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Clave nueva en R2 por cada subida: la URL cambia y la caché nunca sirve una reemplazada. */
export function claveImagen(productoId: string, ext: ExtensionImagen, unico: string): string {
  return `productos/${productoId}/${unico}.${ext}`;
}

/** Archivo de la clave (último segmento) o null si no tiene la forma esperada. */
export function archivoDeClave(clave: string): string | null {
  const archivo = clave.slice(clave.lastIndexOf('/') + 1);
  return /^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(archivo) ? archivo : null;
}

export function extensionDeArchivo(archivo: string): ExtensionImagen | null {
  const ext = archivo.slice(archivo.lastIndexOf('.') + 1);
  return ext === 'jpg' || ext === 'png' || ext === 'webp' ? ext : null;
}
