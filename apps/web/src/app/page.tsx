import { connection } from 'next/server';
import { Suspense } from 'react';
import { API_URL } from '@/lib/api';
import { PruebaApiCliente } from './prueba-api-cliente';

// Sprint 0: página mínima para validar el despliegue (HU-36a) y la prueba 2 de
// HU-36b: un render en servidor por petición y una llamada a la API con credenciales.

async function EstadoApiServidor() {
  await connection(); // fuerza el render en cada petición
  const renderizadoEn = new Date().toISOString();
  let estado: string;
  try {
    const res = await fetch(`${API_URL}/health/live`, { cache: 'no-store' });
    estado = res.ok ? 'API disponible' : `API respondió ${res.status}`;
  } catch {
    estado = 'API no alcanzable';
  }
  return (
    <p data-prueba="ssr">
      Render en servidor: <time dateTime={renderizadoEn}>{renderizadoEn}</time> · {estado}
    </p>
  );
}

export default function Inicio() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1>xdtech.store</h1>
      <p>Tienda de computadoras y componentes. En construcción.</p>
      <Suspense fallback={<p>Consultando la API…</p>}>
        <EstadoApiServidor />
      </Suspense>
      <PruebaApiCliente />
    </main>
  );
}
