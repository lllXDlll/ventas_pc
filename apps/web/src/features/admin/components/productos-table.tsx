'use client';

import { Pencil, Search } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { CATEGORIAS, type CodigoCategoria, NOMBRES_CATEGORIA } from '@/lib/atributos';
import { formatoPrecio } from '@/lib/format';
import { ICONO_CATEGORIA } from '@/lib/iconos-categoria';
import { urlImagen } from '@/lib/imagen';
import type { ProductoAdmin } from '@/lib/tipos';
import type { FiltrosAdmin } from '../api';

// Tabla de productos del panel (presentación): búsqueda, filtro y acciones por fila.

/** Edición de stock en línea con la versión vigente (bloqueo optimista). */
export function StockEditor({
  producto,
  onGuardar,
  guardando,
}: {
  producto: ProductoAdmin;
  onGuardar: (cantidad: number) => void;
  guardando: boolean;
}) {
  const [cantidad, setCantidad] = useState(String(producto.stock.cantidad));
  const [vista, setVista] = useState(producto.stock);
  // Si llega otra cantidad o versión (guardado o conflicto), el campo la refleja.
  if (vista !== producto.stock) {
    setVista(producto.stock);
    setCantidad(String(producto.stock.cantidad));
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          step={1}
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          aria-label={`Stock de ${producto.nombre}`}
          className="h-9 w-20"
        />
        <Button
          type="button"
          tamano="sm"
          variante="contorno"
          disabled={guardando || cantidad === '' || Number(cantidad) < 0}
          onClick={() => onGuardar(Number(cantidad))}
        >
          Guardar stock
        </Button>
      </div>
      <span className="text-xs text-text-muted">versión {producto.stock.version}</span>
    </div>
  );
}

function Miniatura({ producto }: { producto: ProductoAdmin }) {
  const url = urlImagen(producto.imagenUrl);
  const Icono = ICONO_CATEGORIA[producto.categoria.codigo];
  return (
    <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-control bg-image-bg">
      {url ? (
        <img src={url} alt="" width={48} height={48} className="size-full object-contain p-1" />
      ) : (
        <Icono className="size-6 text-image-icon" strokeWidth={1.5} aria-hidden="true" />
      )}
    </div>
  );
}

export function ProductosTable({
  productos,
  cargando,
  filtros,
  onFiltrar,
  onEditar,
  onGuardarStock,
  guardandoStock,
}: {
  productos: ProductoAdmin[] | undefined;
  cargando: boolean;
  filtros: FiltrosAdmin;
  onFiltrar: (f: FiltrosAdmin) => void;
  onEditar: (p: ProductoAdmin) => void;
  onGuardarStock: (p: ProductoAdmin, cantidad: number) => void;
  guardandoStock: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">Buscar productos</span>
          <Search
            className="pointer-events-none absolute top-3 left-3 size-4 text-text-muted"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Buscar por nombre o marca"
            className="pl-9"
            value={filtros.q ?? ''}
            onChange={(e) => onFiltrar({ ...filtros, q: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-text-muted">Filtrar por categoría</span>
          <Select
            className="w-auto"
            value={filtros.categoria ?? ''}
            onChange={(e) =>
              onFiltrar({ ...filtros, categoria: (e.target.value || undefined) as CodigoCategoria })
            }
          >
            <option value="">Todas</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {NOMBRES_CATEGORIA[c]}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="relative overflow-x-auto rounded-card border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">Productos del catálogo</caption>
          <thead className="bg-surface text-left text-xs text-text-muted uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">
                Producto
              </th>
              <th scope="col" className="px-4 py-3">
                Precio
              </th>
              <th scope="col" className="px-4 py-3">
                Estado
              </th>
              <th scope="col" className="px-4 py-3">
                Stock
              </th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {cargando || !productos
              ? Array.from({ length: 5 }, (_, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-4 py-3" colSpan={5}>
                      <Skeleton className="h-10 w-full" />
                    </td>
                  </tr>
                ))
              : productos.map((p) => (
                  <tr key={p.id} className="border-t border-border align-middle">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Miniatura producto={p} />
                        <div className="min-w-0">
                          <p className="font-medium">{p.nombre}</p>
                          <p className="text-xs text-text-muted">
                            {p.categoria.nombre}
                            {p.marca ? ` · ${p.marca}` : ' · sin marca'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-display font-bold whitespace-nowrap">
                      {formatoPrecio(p.precio)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variante={p.activo ? 'exito' : 'neutra'}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <StockEditor
                        producto={p}
                        guardando={guardandoStock === p.id}
                        onGuardar={(c) => onGuardarStock(p, c)}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variante="fantasma"
                        tamano="sm"
                        onClick={() => onEditar(p)}
                        aria-label={`Editar ${p.nombre}`}
                      >
                        <Pencil strokeWidth={1.5} /> Editar
                      </Button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {productos && productos.length === 0 && (
        <p className="text-center text-sm text-text-muted">No hay productos con esa búsqueda.</p>
      )}
    </div>
  );
}
