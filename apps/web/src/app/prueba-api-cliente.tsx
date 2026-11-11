'use client';

import { useState } from 'react';
import { API_URL } from '@/lib/api';

/** Llamada desde el navegador a la API con credenciales (cookies), como hará la tienda. */
export function PruebaApiCliente() {
  const [resultado, setResultado] = useState<string>('sin probar');

  async function probar() {
    setResultado('probando…');
    try {
      const res = await fetch(`${API_URL}/health/live`, { credentials: 'include' });
      setResultado(res.ok ? `OK (${res.status})` : `Error ${res.status}`);
    } catch (error) {
      setResultado(`Fallo de red o CORS: ${String(error)}`);
    }
  }

  return (
    <p data-prueba="cliente">
      <button type="button" onClick={probar}>
        Probar API con credenciales
      </button>{' '}
      <output>{resultado}</output>
    </p>
  );
}
