'use client';

// Pantallas de cliente que exigen sesión (historial, pago): sin sesión llevan a
// /ingresar y vuelven a la ruta actual.
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ErrorApi } from './api-client';

export const esSinSesion = (e: unknown) => e instanceof ErrorApi && e.estado === 401;

/** Redirige a /ingresar?volver=<ruta actual> cuando `error` es un 401 de la API. */
export function useRedirigirSinSesion(error: unknown) {
  const router = useRouter();
  const sinSesion = esSinSesion(error);
  useEffect(() => {
    if (!sinSesion) return;
    const volver = `${window.location.pathname}${window.location.search}`;
    router.replace(`/ingresar?volver=${encodeURIComponent(volver)}`);
  }, [sinSesion, router]);
  return sinSesion;
}
