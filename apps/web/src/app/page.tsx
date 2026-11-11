import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { API_URL } from '@/lib/api';

async function EstadoApiServidor() {
  await connection(); // fuerza el render en cada petición
  let estado: string;
  try {
    // Con tiempo límite: una API caída no debe dejar colgado el render.
    const res = await fetch(`${API_URL}/health/live`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    estado = res.ok ? 'API disponible' : `API respondió ${res.status}`;
  } catch {
    estado = 'API no alcanzable';
  }
  return (
    <p data-prueba="ssr" className="tenue">
      {estado}
    </p>
  );
}

export default function Inicio() {
  return (
    <main>
      <h1>xdtech.store</h1>
      <p>Computadoras y componentes con validación de compatibilidad.</p>
      <p style={{ margin: '1rem 0' }}>
        <Link href="/catalogo">Ver el catálogo</Link>
      </p>
      <Suspense fallback={<p className="tenue">Consultando la API…</p>}>
        <EstadoApiServidor />
      </Suspense>
    </main>
  );
}
