// Token de sesión y cookie (spec autenticacion, design.md D3 del Sprint 1).
// El token es aleatorio y opaco (256 bits); en Postgres solo se guarda su SHA-256.
// No necesita estiramiento como una contraseña: su entropía ya impide adivinarlo.
import type { CookieOptions } from 'express';

export const COOKIE_SESION = 'xd_sesion';

function aBase64Url(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function nuevoToken(): string {
  return aBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Valor de la cookie de sesión en la cabecera Cookie, o undefined. */
export function tokenDeCookie(cabecera: string | undefined): string | undefined {
  for (const parte of (cabecera ?? '').split(';')) {
    const igual = parte.indexOf('=');
    if (igual < 0) continue;
    if (parte.slice(0, igual).trim() === COOKIE_SESION) {
      const valor = parte.slice(igual + 1).trim();
      return valor || undefined;
    }
  }
  return undefined;
}

export interface ConfigSesion {
  /** Vacío en local: la cookie va sin Domain ni Secure. */
  dominio: string;
  ttlDias: number;
}

export function leerConfigSesion(entorno: Partial<Record<string, unknown>>): ConfigSesion {
  const ttl = Number(entorno.SESSION_TTL_DAYS);
  return {
    dominio: typeof entorno.COOKIE_DOMAIN === 'string' ? entorno.COOKIE_DOMAIN.trim() : '',
    ttlDias: Number.isFinite(ttl) && ttl > 0 ? ttl : 7,
  };
}

/** Atributos de la cookie: HttpOnly, SameSite=Lax y, en producción, Domain y Secure. */
export function opcionesCookie(config: ConfigSesion): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    ...(config.dominio ? { domain: config.dominio, secure: true } : {}),
  };
}
