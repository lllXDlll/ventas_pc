'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ErrorApi, formatoPrecio, type Pagina, type ProductoAdmin } from '@/lib/api';
import {
  ATRIBUTOS,
  CATEGORIAS,
  type CodigoCategoria,
  convertir,
  tipoDeCategoria,
} from '@/lib/atributos';
import { useSesion } from '../../sesion';

type Aviso = { tipo: 'exito' | 'alerta'; texto: string } | null;

const mensaje = (e: unknown) => (e instanceof ErrorApi ? e.message : 'Ocurrió un error.');

/** Panel de catálogo (spec catalogo y autorizacion-roles): solo para ADMIN. */
export default function PanelCatalogo() {
  const { usuario } = useSesion();
  if (usuario === undefined) return <p className="tenue">Cargando…</p>;
  if (usuario === null) {
    return (
      <main>
        <p className="alerta">
          Inicia sesión como administrador para usar el panel.{' '}
          <Link href="/ingresar">Ingresar</Link>
        </p>
      </main>
    );
  }
  if (usuario.rol !== 'ADMIN') {
    return (
      <main>
        <p role="alert" className="alerta">
          No tienes acceso al panel de administración.
        </p>
      </main>
    );
  }
  return <Panel />;
}

function Panel() {
  const [productos, setProductos] = useState<ProductoAdmin[]>([]);
  const [aviso, setAviso] = useState<Aviso>(null);
  const cargar = useCallback(async () => {
    try {
      const pagina = await api<Pagina<ProductoAdmin>>('/admin/productos');
      setProductos(pagina.productos);
    } catch (e) {
      setAviso({ tipo: 'alerta', texto: mensaje(e) });
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const reemplazar = (p: ProductoAdmin) =>
    setProductos((lista) => lista.map((x) => (x.id === p.id ? p : x)));

  return (
    <main>
      <h1>Panel de catálogo</h1>
      {aviso && (
        <p role="status" className={aviso.tipo}>
          {aviso.texto}
        </p>
      )}
      <NuevoProducto
        alCrear={(p) => {
          setProductos((lista) => [p, ...lista]);
          setAviso({ tipo: 'exito', texto: `Se creó «${p.nombre}».` });
        }}
      />
      <h2 style={{ margin: '1.5rem 0 0.5rem' }}>Productos ({productos.length})</h2>
      <div className="tabla-desplazable">
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Precio</th>
              <th>Activo</th>
              <th>Stock</th>
              <th>Atributos</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <FilaProducto key={p.id} producto={p} alCambiar={reemplazar} avisar={setAviso} />
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function NuevoProducto({ alCrear }: { alCrear: (p: ProductoAdmin) => void }) {
  const [categoria, setCategoria] = useState<CodigoCategoria>('PROCESADOR');
  const [error, setError] = useState<string | null>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const datos = new FormData(formulario);
    const atributos: Record<string, unknown> = {};
    for (const [nombre, tipo] of Object.entries(ATRIBUTOS[categoria])) {
      atributos[nombre] = convertir(String(datos.get(`attr_${nombre}`) ?? ''), tipo);
    }
    const descripcion = String(datos.get('descripcion') ?? '').trim();
    if (descripcion) atributos.descripcion = descripcion;
    setError(null);
    try {
      const creado = await api<ProductoAdmin>('/admin/productos', {
        metodo: 'POST',
        cuerpo: {
          nombre: datos.get('nombre'),
          categoria,
          tipo: tipoDeCategoria(categoria),
          precio: String(datos.get('precio') ?? '').trim(),
          stockInicial: Number(datos.get('stockInicial')),
          atributos,
        },
      });
      formulario.reset();
      alCrear(creado);
    } catch (e) {
      setError(mensaje(e));
    }
  }

  return (
    <details>
      <summary>Nuevo producto</summary>
      <form className="formulario" onSubmit={enviar} style={{ marginTop: '0.75rem' }}>
        <label>
          Nombre
          <input name="nombre" required maxLength={200} />
        </label>
        <label>
          Categoría
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as CodigoCategoria)}
          >
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Precio (S/)
          <input name="precio" inputMode="decimal" required placeholder="1299.90" />
        </label>
        <label>
          Stock inicial
          <input name="stockInicial" type="number" min={0} step={1} required defaultValue={0} />
        </label>
        {Object.entries(ATRIBUTOS[categoria]).map(([nombre, tipo]) => (
          <label key={`${categoria}-${nombre}`}>
            {nombre}{' '}
            {tipo === 'lista' ? '(separados por comas)' : tipo === 'entero' ? '(entero)' : ''}
            <input
              name={`attr_${nombre}`}
              required
              inputMode={tipo === 'entero' ? 'numeric' : undefined}
            />
          </label>
        ))}
        <label>
          Descripción (opcional)
          <input name="descripcion" />
        </label>
        {error && (
          <p role="alert" className="alerta">
            {error}
          </p>
        )}
        <button type="submit">Crear producto</button>
      </form>
    </details>
  );
}

function FilaProducto({
  producto,
  alCambiar,
  avisar,
}: {
  producto: ProductoAdmin;
  alCambiar: (p: ProductoAdmin) => void;
  avisar: (a: Aviso) => void;
}) {
  const [precio, setPrecio] = useState(producto.precio);
  const [cantidad, setCantidad] = useState(String(producto.stock.cantidad));
  const [atributos, setAtributos] = useState(JSON.stringify(producto.atributos, null, 2));

  async function actualizar(cambios: Record<string, unknown>, descripcion: string) {
    try {
      const actualizado = await api<ProductoAdmin>(`/admin/productos/${producto.id}`, {
        metodo: 'PATCH',
        cuerpo: cambios,
      });
      alCambiar(actualizado);
      avisar({ tipo: 'exito', texto: `${descripcion}: «${producto.nombre}».` });
    } catch (e) {
      avisar({ tipo: 'alerta', texto: mensaje(e) });
    }
  }

  async function guardarStock() {
    try {
      const vigente = await api<{ cantidad: number; version: number }>(
        `/admin/stock/${producto.id}`,
        {
          metodo: 'PATCH',
          cuerpo: { cantidad: Number(cantidad), version: producto.stock.version },
        },
      );
      alCambiar({
        ...producto,
        stock: vigente,
        disponible: vigente.cantidad,
        agotado: vigente.cantidad === 0,
      });
      avisar({ tipo: 'exito', texto: `Stock guardado: «${producto.nombre}».` });
    } catch (e) {
      if (e instanceof ErrorApi && e.codigo === 'CONFLICTO' && e.detalle) {
        const vigente = e.detalle as { cantidad: number; version: number };
        alCambiar({ ...producto, stock: vigente });
        setCantidad(String(vigente.cantidad));
        avisar({
          tipo: 'alerta',
          texto: `${e.message} Cantidad vigente: ${vigente.cantidad} (versión ${vigente.version}).`,
        });
        return;
      }
      avisar({ tipo: 'alerta', texto: mensaje(e) });
    }
  }

  function guardarAtributos() {
    let valor: unknown;
    try {
      valor = JSON.parse(atributos);
    } catch {
      avisar({ tipo: 'alerta', texto: 'Los atributos no son un JSON válido.' });
      return;
    }
    void actualizar({ atributos: valor }, 'Atributos guardados');
  }

  return (
    <tr>
      <td>
        <strong>{producto.nombre}</strong>
        <br />
        <span className="tenue">{producto.categoria.nombre}</span>
      </td>
      <td>
        <span className="fila">
          <input value={precio} onChange={(e) => setPrecio(e.target.value)} size={9} />
          <button type="button" onClick={() => actualizar({ precio }, 'Precio guardado')}>
            Guardar
          </button>
        </span>
        <span className="tenue">{formatoPrecio(producto.precio)}</span>
      </td>
      <td>
        <input
          type="checkbox"
          aria-label="Activo"
          checked={producto.activo}
          onChange={(e) =>
            actualizar({ activo: e.target.checked }, e.target.checked ? 'Activado' : 'Desactivado')
          }
        />
      </td>
      <td>
        <span className="fila">
          <input
            type="number"
            min={0}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            style={{ width: '5.5rem' }}
          />
          <button type="button" onClick={guardarStock}>
            Guardar
          </button>
        </span>
        <span className="tenue">versión {producto.stock.version}</span>
      </td>
      <td>
        <details>
          <summary>Editar</summary>
          <textarea
            value={atributos}
            onChange={(e) => setAtributos(e.target.value)}
            rows={6}
            cols={32}
          />
          <button type="button" onClick={guardarAtributos}>
            Guardar atributos
          </button>
        </details>
      </td>
    </tr>
  );
}
