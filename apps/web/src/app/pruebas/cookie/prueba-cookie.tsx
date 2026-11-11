'use client';

import { useState } from 'react';
import { API_URL } from '@/lib/api';

type Estado = { emitida?: string; recibida?: string | null; error?: string; navegador?: string };

export function PruebaCookie() {
  const [estado, setEstado] = useState<Estado>({});

  async function llamar(metodo: 'POST' | 'GET') {
    try {
      const res = await fetch(`${API_URL}/__prueba/cookie`, {
        method: metodo,
        credentials: 'include',
      });
      const cuerpo = (await res.json()) as { emitida?: string; recibida?: string | null };
      setEstado((previo) => ({
        ...previo,
        ...cuerpo,
        error: undefined,
        navegador: navigator.userAgent,
      }));
    } catch (error) {
      setEstado((previo) => ({ ...previo, error: String(error) }));
    }
  }

  const resultado =
    estado.emitida === undefined || estado.recibida === undefined
      ? 'sin completar'
      : estado.recibida === estado.emitida
        ? 'OK: la API recibió la cookie'
        : 'NO OK: la API no recibió la cookie emitida';

  return (
    <section>
      <p>
        <button type="button" onClick={() => llamar('POST')}>
          Emitir cookie
        </button>{' '}
        <button type="button" onClick={() => llamar('GET')}>
          Leer cookie
        </button>
      </p>
      <dl data-prueba="cookie">
        <dt>Emitida</dt>
        <dd>{estado.emitida ?? '—'}</dd>
        <dt>Recibida por la API</dt>
        <dd>{estado.recibida === undefined ? '—' : (estado.recibida ?? '(ninguna)')}</dd>
        <dt>Resultado</dt>
        <dd>
          <strong>{resultado}</strong>
        </dd>
        <dt>Navegador</dt>
        <dd>{estado.navegador ?? '—'}</dd>
      </dl>
      {estado.error && <p role="alert">Error: {estado.error}</p>}
    </section>
  );
}
