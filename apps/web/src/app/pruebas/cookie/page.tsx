// TEMPORAL (Sprint 0, prueba 6 de HU-36b). Se elimina en la tarea 8.1.
import type { Metadata } from 'next';
import { PruebaCookie } from './prueba-cookie';

export const metadata: Metadata = { title: 'Prueba de cookie', robots: { index: false } };

export default function Pagina() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1>Prueba 6: cookie entre subdominios</h1>
      <ol>
        <li>Pulsa «Emitir cookie»: la API responde con una cookie de Domain=.xdtech.store.</li>
        <li>Pulsa «Leer cookie»: la API devuelve la cookie que recibió.</li>
        <li>La prueba pasa si el valor leído coincide con el emitido.</li>
      </ol>
      <PruebaCookie />
    </main>
  );
}
