// Llamadas de autenticación (spec autenticacion).
import { api } from '@/lib/api-client';
import type { Usuario } from '@/lib/tipos';

export interface Credenciales {
  correo: string;
  contrasena: string;
}

export const usuarioActual = () => api<Usuario>('/auth/me');
export const iniciarSesion = (c: Credenciales) =>
  api<Usuario>('/auth/login', { metodo: 'POST', cuerpo: c });
export const registrar = (c: Credenciales) =>
  api<{ correo: string }>('/auth/registro', { metodo: 'POST', cuerpo: c });
export const cerrarSesion = () => api<void>('/auth/logout', { metodo: 'POST' });
