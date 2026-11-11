import Link from 'next/link';
import { connection } from 'next/server';
import {
  apiServidor,
  type Categoria,
  ErrorApi,
  formatoPrecio,
  type Pagina,
  type Producto,
} from '@/lib/api';

export const metadata = { title: 'Catálogo · xdtech.store' };

type Filtros = Partial<Record<'categoria' | 'precioMin' | 'precioMax' | 'pagina', string>>;

function texto(valor: string | string[] | undefined): string | undefined {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v?.trim() || undefined;
}

function consulta(filtros: Filtros, cambios: Filtros = {}): string {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries({ ...filtros, ...cambios })) {
    if (valor) params.set(clave, valor);
  }
  const q = params.toString();
  return q ? `?${q}` : '';
}

/** Catálogo público con filtros y paginación (spec catalogo), renderizado en servidor. */
export default async function Catalogo({ searchParams }: PageProps<'/catalogo'>) {
  await connection(); // render por petición: el stock debe ser actual
  const sp = await searchParams;
  const filtros: Filtros = {
    categoria: texto(sp.categoria),
    precioMin: texto(sp.precioMin),
    precioMax: texto(sp.precioMax),
    pagina: texto(sp.pagina),
  };

  let categorias: Categoria[] = [];
  let resultado: Pagina<Producto> | null = null;
  let error: string | null = null;
  try {
    [categorias, resultado] = await Promise.all([
      apiServidor<Categoria[]>('/categorias'),
      apiServidor<Pagina<Producto>>(`/productos${consulta(filtros)}`),
    ]);
  } catch (e) {
    error = e instanceof ErrorApi ? e.message : 'No se pudo cargar el catálogo.';
  }
  const paginas = resultado ? Math.max(1, Math.ceil(resultado.total / resultado.porPagina)) : 1;

  return (
    <main>
      <h1>Catálogo</h1>
      <form className="fila" method="get" style={{ marginBottom: '1rem' }}>
        <label>
          Categoría
          <select name="categoria" defaultValue={filtros.categoria ?? ''}>
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Precio mínimo
          <input name="precioMin" inputMode="decimal" defaultValue={filtros.precioMin} size={8} />
        </label>
        <label>
          Precio máximo
          <input name="precioMax" inputMode="decimal" defaultValue={filtros.precioMax} size={8} />
        </label>
        <button type="submit">Filtrar</button>
        <Link href="/catalogo">Limpiar</Link>
      </form>

      {error && (
        <p role="alert" className="alerta">
          {error}
        </p>
      )}
      {resultado && (
        <>
          <p className="tenue">{resultado.total} productos disponibles</p>
          <div className="rejilla" style={{ marginTop: '0.75rem' }}>
            {resultado.productos.map((p) => (
              <article key={p.id} className="tarjeta">
                <span className="tenue">{p.categoria.nombre}</span>
                <Link href={`/catalogo/${p.id}`}>
                  <strong>{p.nombre}</strong>
                </Link>
                <span>{formatoPrecio(p.precio)}</span>
                <span>Disponibles: {p.disponible}</span>
              </article>
            ))}
          </div>
          {paginas > 1 && (
            <nav className="fila" style={{ marginTop: '1rem' }}>
              {resultado.pagina > 1 && (
                <Link
                  href={`/catalogo${consulta(filtros, { pagina: String(resultado.pagina - 1) })}`}
                >
                  ← Anterior
                </Link>
              )}
              <span>
                Página {resultado.pagina} de {paginas}
              </span>
              {resultado.pagina < paginas && (
                <Link
                  href={`/catalogo${consulta(filtros, { pagina: String(resultado.pagina + 1) })}`}
                >
                  Siguiente →
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </main>
  );
}
