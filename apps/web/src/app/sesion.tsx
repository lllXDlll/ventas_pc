'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ErrorApi, type Usuario } from '@/lib/api';

interface EstadoSesion {
  /** undefined mientras se consulta; null sin sesión. */
  usuario: Usuario | null | undefined;
  recargar: () => Promise<void>;
}

const ContextoSesion = createContext<EstadoSesion>({
  usuario: undefined,
  recargar: async () => {},
});

export function useSesion(): EstadoSesion {
  return useContext(ContextoSesion);
}

/** Estado de la sesión del navegador, leído de `GET /auth/me`. */
export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);
  const recargar = useCallback(async () => {
    try {
      setUsuario(await api<Usuario>('/auth/me'));
    } catch (error) {
      // 401 = sin sesión; otro error (API caída) también se muestra como sin sesión.
      if (!(error instanceof ErrorApi) || error.estado !== 401) console.warn(error);
      setUsuario(null);
    }
  }, []);
  useEffect(() => {
    void recargar();
  }, [recargar]);
  return (
    <ContextoSesion.Provider value={{ usuario, recargar }}>{children}</ContextoSesion.Provider>
  );
}

export function CabeceraSesion() {
  const { usuario, recargar } = useSesion();
  const router = useRouter();
  async function salir() {
    try {
      await api('/auth/logout', { metodo: 'POST' });
    } finally {
      await recargar();
      router.push('/');
    }
  }
  if (usuario === undefined) return <span className="tenue">…</span>;
  if (usuario === null) {
    return (
      <span className="fila">
        <Link href="/ingresar">Ingresar</Link>
        <Link href="/registro">Crear cuenta</Link>
      </span>
    );
  }
  return (
    <span className="fila">
      {usuario.rol === 'ADMIN' && <Link href="/admin/catalogo">Panel</Link>}
      <span className="tenue">{usuario.correo}</span>
      <button type="button" onClick={salir}>
        Cerrar sesión
      </button>
    </span>
  );
}
