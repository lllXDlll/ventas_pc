import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { apiServidor, ErrorApi, formatoPrecio, type Producto } from '@/lib/api';

function valor(v: unknown): string {
  if (Array.isArray(v)) return v.join(', ');
  return typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
}

/** Detalle con atributos técnicos y disponibilidad; un agotado se muestra como tal. */
export default async function DetalleProducto({ params }: PageProps<'/catalogo/[id]'>) {
  await connection();
  const { id } = await params;
  let producto: Producto;
  try {
    producto = await apiServidor<Producto>(`/productos/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ErrorApi && e.estado === 404) notFound();
    return (
      <main>
        <p role="alert" className="alerta">
          {e instanceof ErrorApi ? e.message : 'No se pudo cargar el producto.'}
        </p>
      </main>
    );
  }
  const atributos = Object.entries(producto.atributos);
  return (
    <main>
      <p>
        <Link href="/catalogo">← Volver al catálogo</Link>
      </p>
      <h1>{producto.nombre}</h1>
      <p className="tenue">
        {producto.categoria.nombre} · {producto.tipo === 'EQUIPO' ? 'Equipo armado' : 'Componente'}
      </p>
      <p style={{ fontSize: '1.4rem', margin: '0.5rem 0' }}>{formatoPrecio(producto.precio)}</p>
      {producto.agotado ? (
        <p className="alerta">Agotado: por ahora no hay unidades disponibles.</p>
      ) : (
        <p className="exito">Disponibles: {producto.disponible}</p>
      )}
      {atributos.length > 0 && (
        <>
          <h2 style={{ margin: '1rem 0 0.5rem' }}>Atributos técnicos</h2>
          <table>
            <tbody>
              {atributos.map(([nombre, v]) => (
                <tr key={nombre}>
                  <th>{nombre}</th>
                  <td>{valor(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
