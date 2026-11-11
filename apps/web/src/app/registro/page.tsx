'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { api, ErrorApi } from '@/lib/api';

/** Registro (spec autenticacion): muestra los mensajes de la API, incluidos 409 y 429. */
export default function Registro() {
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    setEnviando(true);
    setError(null);
    try {
      const usuario = await api<{ correo: string }>('/auth/registro', {
        metodo: 'POST',
        cuerpo: { correo: datos.get('correo'), contrasena: datos.get('contrasena') },
      });
      setCreado(usuario.correo);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo crear la cuenta.');
    } finally {
      setEnviando(false);
    }
  }

  if (creado) {
    return (
      <main>
        <h1>Cuenta creada</h1>
        <p className="exito">
          La cuenta {creado} está lista. Ya puedes <Link href="/ingresar">iniciar sesión</Link>.
        </p>
      </main>
    );
  }
  return (
    <main>
      <h1>Crear cuenta</h1>
      <form className="formulario" onSubmit={enviar}>
        <label>
          Correo
          <input name="correo" type="email" autoComplete="email" required />
        </label>
        <label>
          Contraseña (8 caracteres o más)
          <input
            name="contrasena"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        {error && (
          <p role="alert" className="alerta">
            {error}
          </p>
        )}
        <button type="submit" disabled={enviando}>
          {enviando ? 'Creando…' : 'Crear cuenta'}
        </button>
        <p>
          ¿Ya tienes cuenta? <Link href="/ingresar">Inicia sesión</Link>
        </p>
      </form>
    </main>
  );
}
