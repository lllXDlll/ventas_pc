'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { api, ErrorApi, type Usuario } from '@/lib/api';
import { useSesion } from '../sesion';

/** Inicio de sesión (spec autenticacion): el error es siempre el genérico de la API. */
export default function Ingresar() {
  const { recargar } = useSesion();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    setEnviando(true);
    setError(null);
    try {
      const usuario = await api<Usuario>('/auth/login', {
        metodo: 'POST',
        cuerpo: { correo: datos.get('correo'), contrasena: datos.get('contrasena') },
      });
      await recargar();
      router.push(usuario.rol === 'ADMIN' ? '/admin/catalogo' : '/catalogo');
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo iniciar sesión.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main>
      <h1>Iniciar sesión</h1>
      <form className="formulario" onSubmit={enviar}>
        <label>
          Correo
          <input name="correo" type="email" autoComplete="email" required />
        </label>
        <label>
          Contraseña
          <input name="contrasena" type="password" autoComplete="current-password" required />
        </label>
        {error && (
          <p role="alert" className="alerta">
            {error}
          </p>
        )}
        <button type="submit" disabled={enviando}>
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
        <p>
          ¿No tienes cuenta? <Link href="/registro">Créala aquí</Link>
        </p>
      </form>
    </main>
  );
}
