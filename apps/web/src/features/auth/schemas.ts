// Validación en línea de los formularios de cuenta, con las mismas reglas que la API.
import { z } from 'zod';

const correo = z
  .string()
  .trim()
  .min(1, 'Escribe tu correo.')
  .max(254, 'El correo es demasiado largo.')
  .email('El correo no tiene un formato válido.');

export const esquemaIngreso = z.object({
  correo,
  contrasena: z.string().min(1, 'Escribe tu contraseña.').max(128),
});

export const esquemaRegistro = z.object({
  correo,
  contrasena: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres.')
    .max(128, 'La contraseña no puede tener más de 128 caracteres.'),
});

export type DatosIngreso = z.infer<typeof esquemaIngreso>;
export type DatosRegistro = z.infer<typeof esquemaRegistro>;
