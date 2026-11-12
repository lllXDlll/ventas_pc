'use client';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Minus,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { ImagenProducto, ProductCard } from '@/components/producto/producto';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EstadoError, EstadoVacio } from '@/components/ui/estado';
import { Skeleton } from '@/components/ui/skeleton';
import { type CodigoCategoria, NOMBRES_CATEGORIA } from '@/lib/atributos';
import { formatoPrecio } from '@/lib/format';
import { ICONO_CATEGORIA } from '@/lib/iconos-categoria';
import type { Producto } from '@/lib/tipos';
import { nombreUso } from '@/lib/usos';
import { cn } from '@/lib/utils';
import type { Rechazo } from '../api';
import { MAX_CANTIDAD } from '../seleccion';

// Componentes de presentación del armador (spec armador): solo props, sin datos propios.

export interface Elegido {
  producto: Producto | undefined;
  productoId: string;
  cantidad: number;
}

function Cantidad({
  valor,
  onCambiar,
  nombre,
}: {
  valor: number;
  onCambiar: (n: number) => void;
  nombre: string;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={`Cantidad de ${nombre}`}>
      <Button
        type="button"
        tamano="icono"
        variante="fantasma"
        className="size-8"
        aria-label="Quitar una"
        disabled={valor <= 1}
        onClick={() => onCambiar(valor - 1)}
      >
        <Minus strokeWidth={1.5} />
      </Button>
      <span className="w-6 text-center text-sm" aria-live="polite">
        {valor}
      </span>
      <Button
        type="button"
        tamano="icono"
        variante="fantasma"
        className="size-8"
        aria-label="Agregar una"
        disabled={valor >= MAX_CANTIDAD}
        onClick={() => onCambiar(valor + 1)}
      >
        <Plus strokeWidth={1.5} />
      </Button>
    </div>
  );
}

/** Un paso del armador: lo elegido y, abierto, los productos con stock de la categoría. */
export function PasoCategoria({
  categoria,
  elegidos,
  multiple,
  abierto,
  onAlternar,
  productos,
  cargando,
  error,
  onReintentar,
  onElegir,
  onQuitar,
  onCantidad,
  conflictos,
}: {
  categoria: CodigoCategoria;
  elegidos: Elegido[];
  multiple: boolean;
  abierto: boolean;
  onAlternar: () => void;
  productos: Producto[] | undefined;
  cargando: boolean;
  error: string | null;
  onReintentar: () => void;
  onElegir: (p: Producto) => void;
  onQuitar: (productoId: string) => void;
  onCantidad: (productoId: string, cantidad: number) => void;
  /** Productos de este paso que aparecen en algún rechazo. */
  conflictos: Set<string>;
}) {
  const Icono = ICONO_CATEGORIA[categoria];
  const nombre = NOMBRES_CATEGORIA[categoria];
  const idPanel = `paso-${categoria}`;
  const elegidosIds = new Set(elegidos.map((e) => e.productoId));
  return (
    <section
      className="rounded-card border border-border bg-surface"
      aria-labelledby={`${idPanel}-titulo`}
    >
      <h2 id={`${idPanel}-titulo`} className="m-0">
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierto}
          aria-controls={idPanel}
          className="flex w-full items-center gap-3 p-4 text-left"
        >
          <Icono
            className="size-6 shrink-0 text-primary-soft"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className="flex-1 font-display text-lg">{nombre}</span>
          {elegidos.length > 0 ? (
            <Badge
              variante={elegidos.some((e) => conflictos.has(e.productoId)) ? 'peligro' : 'exito'}
            >
              {elegidos.length === 1 ? '1 elegido' : `${elegidos.length} elegidos`}
            </Badge>
          ) : (
            <span className="text-xs text-text-muted">Sin elegir</span>
          )}
          <ChevronDown
            className={cn('size-5 shrink-0 transition-transform', abierto && 'rotate-180')}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </button>
      </h2>

      {elegidos.length > 0 && (
        <ul className="flex flex-col gap-2 px-4 pb-4" aria-label={`${nombre} elegido`}>
          {elegidos.map((e) => (
            <li
              key={e.productoId}
              className={cn(
                'flex items-center gap-3 rounded-control border border-border bg-card p-2',
                conflictos.has(e.productoId) && 'border-danger/60',
              )}
            >
              {e.producto ? (
                <ImagenProducto
                  producto={e.producto}
                  className="size-12 shrink-0 rounded-control"
                />
              ) : (
                <Skeleton className="size-12 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.producto?.nombre ?? 'Cargando…'}</p>
                {e.producto && (
                  <p className="text-xs text-text-muted">{formatoPrecio(e.producto.precio)}</p>
                )}
              </div>
              {multiple && (
                <Cantidad
                  valor={e.cantidad}
                  nombre={e.producto?.nombre ?? nombre}
                  onCambiar={(n) => onCantidad(e.productoId, n)}
                />
              )}
              <Button
                type="button"
                tamano="icono"
                variante="fantasma"
                className="size-8"
                aria-label={`Quitar ${e.producto?.nombre ?? 'producto'}`}
                onClick={() => onQuitar(e.productoId)}
              >
                <Trash2 strokeWidth={1.5} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {abierto && (
        <div id={idPanel} className="border-t border-border p-4">
          {error ? (
            <EstadoError mensaje={error} onReintentar={onReintentar} />
          ) : cargando || !productos ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-72 w-full rounded-card" />
              ))}
            </div>
          ) : productos.length === 0 ? (
            <EstadoVacio titulo={`No hay ${nombre.toLowerCase()} con stock`} />
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {productos.map((p) => {
                const elegido = elegidosIds.has(p.id);
                return (
                  <ProductCard
                    key={p.id}
                    producto={p}
                    seleccionada={elegido}
                    accion={
                      <Button
                        type="button"
                        tamano="sm"
                        variante={elegido ? 'contorno' : 'primario'}
                        className="w-full"
                        disabled={elegido}
                        onClick={() => onElegir(p)}
                        aria-label={`${elegido ? 'Elegido' : 'Elegir'}: ${p.nombre}`}
                      >
                        {elegido ? 'Elegido' : multiple && elegidos.length ? 'Agregar' : 'Elegir'}
                      </Button>
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Lista de rechazos de compatibilidad, anunciada al cambiar. */
export function ListaRechazos({
  rechazos,
  compatible,
  validando,
  vacio,
}: {
  rechazos: Rechazo[];
  compatible: boolean | undefined;
  validando: boolean;
  vacio: boolean;
}) {
  return (
    <div aria-live="polite" aria-busy={validando || undefined} className="flex flex-col gap-2">
      {vacio ? (
        <p className="text-sm text-text-muted">Elige componentes para validar su compatibilidad.</p>
      ) : compatible === undefined ? (
        <Skeleton className="h-6 w-40" />
      ) : compatible ? (
        <p className="inline-flex items-center gap-2 text-sm font-medium text-success">
          <CheckCircle2 className="size-5" strokeWidth={1.5} aria-hidden="true" />
          Todo es compatible
        </p>
      ) : (
        <>
          <p className="inline-flex items-center gap-2 text-sm font-medium text-danger">
            <AlertTriangle className="size-5" strokeWidth={1.5} aria-hidden="true" />
            {rechazos.length === 1 ? '1 incompatibilidad' : `${rechazos.length} incompatibilidades`}
          </p>
          <ul className="flex flex-col gap-2" aria-label="Incompatibilidades">
            {rechazos.map((r, i) => (
              <li
                key={`${r.codigo}-${i}`}
                className="rounded-control border border-danger/40 bg-card p-3 text-sm"
              >
                <Badge variante="peligro" className="mb-1">
                  {r.codigo}
                </Badge>
                <p>{r.mensaje}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Resumen lateral: elegidos, total, compatibilidad y acciones. */
export function ResumenArmado({
  elegidos,
  total,
  compatibilidad,
  acciones,
  aviso,
  origen,
}: {
  elegidos: Elegido[];
  total: string;
  compatibilidad: ReactNode;
  acciones: ReactNode;
  aviso: ReactNode;
  /** Insignia de una configuración recomendada por el asistente (Sprint 5). */
  origen?: ReactNode;
}) {
  return (
    <aside
      aria-label="Resumen del armado"
      className="flex flex-col gap-4 self-start rounded-card border border-border bg-card p-5 lg:sticky lg:top-36"
    >
      <h2 className="text-xl">Tu armado</h2>
      {origen}
      {elegidos.length === 0 ? (
        <p className="text-sm text-text-muted">Aún no elegiste componentes.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {elegidos.map((e) => (
            <li key={e.productoId} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">
                {e.cantidad > 1 ? `${e.cantidad} × ` : ''}
                {e.producto?.nombre ?? '…'}
              </span>
              <span className="shrink-0 text-text-muted">
                {e.producto ? formatoPrecio(Number(e.producto.precio) * e.cantidad) : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-baseline justify-between border-t border-border pt-3">
        <span className="text-sm text-text-muted">Total</span>
        <span className="font-display text-2xl font-bold">{formatoPrecio(total)}</span>
      </p>
      {compatibilidad}
      {aviso}
      <div className="flex flex-col gap-2">{acciones}</div>
    </aside>
  );
}

/** "Agregar al carrito": guarda el armado y lo agrega (Sprint 3); si no es agregable, el motivo. */
export function BotonCarritoArmado({
  agregable,
  motivo,
  ocupado,
  onAgregar,
}: {
  agregable: boolean;
  motivo: string;
  ocupado: boolean;
  onAgregar: () => void;
}) {
  if (agregable) {
    return (
      <Button
        type="button"
        variante="contorno"
        className="w-full"
        disabled={ocupado}
        onClick={onAgregar}
      >
        {ocupado ? 'Agregando…' : 'Agregar al carrito'}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variante="contorno" disabled className="w-full">
        Agregar al carrito
      </Button>
      <span className="text-xs text-text-muted">{motivo}</span>
    </div>
  );
}

/** Configuración que vino del asistente (spec armador, Sprint 5). */
export function InsigniaAsistente({
  presupuesto,
  uso,
}: {
  presupuesto: string | null | undefined;
  uso: string | null | undefined;
}) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
      <Badge variante="ia">
        <Sparkles strokeWidth={1.5} /> Recomendada por IA
      </Badge>
      {presupuesto && <span>Presupuesto {formatoPrecio(presupuesto)}</span>}
      {uso && <span>· {nombreUso(uso)}</span>}
    </p>
  );
}
