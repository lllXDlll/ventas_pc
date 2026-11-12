// Validación del formulario de producto con las mismas reglas que la API.
import { z } from 'zod';
import {
  ATRIBUTOS,
  ATRIBUTOS_OPCIONALES,
  CATEGORIAS,
  type CodigoCategoria,
  convertir,
} from '@/lib/atributos';

export const MAX_BYTES_IMAGEN = 2 * 1024 * 1024;
export const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];

export const esquemaProducto = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio.').max(200),
  marca: z.string().trim().min(1, 'La marca es obligatoria.').max(60),
  categoria: z.enum(CATEGORIAS),
  precio: z
    .string()
    .trim()
    .regex(/^\d{1,10}(\.\d{1,2})?$/, 'El precio debe ser un número con hasta 2 decimales.'),
  stockInicial: z.string().regex(/^\d+$/, 'El stock inicial debe ser un entero no negativo.'),
  activo: z.boolean(),
  descripcion: z.string().max(2000).optional(),
  atributos: z.record(z.string(), z.string()),
});

export type DatosProducto = z.infer<typeof esquemaProducto>;

/** Errores de los atributos obligatorios de la categoría (los campos son texto). */
export function erroresAtributos(
  categoria: CodigoCategoria,
  valores: Record<string, string>,
): Record<string, string> {
  const errores: Record<string, string> = {};
  for (const [nombre, tipo] of Object.entries(ATRIBUTOS[categoria])) {
    const v = (valores[nombre] ?? '').trim();
    if (!v) errores[nombre] = 'Obligatorio.';
    else if (tipo === 'entero' && !/^[1-9]\d*$/.test(v))
      errores[nombre] = 'Debe ser un entero positivo.';
  }
  // Opcionales (Sprint 2): solo se validan si se completaron.
  for (const [nombre, tipo] of Object.entries(ATRIBUTOS_OPCIONALES[categoria] ?? {})) {
    const v = (valores[nombre] ?? '').trim();
    if (v && tipo === 'entero' && !/^[1-9]d*$/.test(v))
      errores[nombre] = 'Debe ser un entero positivo.';
  }
  return errores;
}

/** Atributos del formulario convertidos a sus tipos (más la descripción libre). */
export function atributosDe(
  categoria: CodigoCategoria,
  valores: Record<string, string>,
  descripcion?: string,
): Record<string, unknown> {
  const atributos: Record<string, unknown> = {};
  for (const [nombre, tipo] of Object.entries(ATRIBUTOS[categoria])) {
    atributos[nombre] = convertir(valores[nombre] ?? '', tipo);
  }
  for (const [nombre, tipo] of Object.entries(ATRIBUTOS_OPCIONALES[categoria] ?? {})) {
    if ((valores[nombre] ?? '').trim()) atributos[nombre] = convertir(valores[nombre] ?? '', tipo);
  }
  if (descripcion?.trim()) atributos.descripcion = descripcion.trim();
  return atributos;
}

export function errorImagen(archivo: File): string | null {
  if (!TIPOS_IMAGEN.includes(archivo.type)) return 'La imagen debe ser JPEG, PNG o WebP.';
  if (archivo.size > MAX_BYTES_IMAGEN) return 'La imagen no puede pesar más de 2 MB.';
  return null;
}
