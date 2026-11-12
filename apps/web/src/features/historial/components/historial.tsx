'use client';

import {
  CheckCircle2,
  FileText,
  Printer,
  RefreshCw,
  Sparkles,
  Wrench,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { esCategoria, NOMBRES_CATEGORIA } from '@/lib/atributos';
import { formatoFecha, formatoPrecio } from '@/lib/format';
import type {
  Comprobante,
  ConfiguracionHistorial,
  DetalleCompra,
  ResumenCompra,
  Revalidacion,
} from '../api';

// Presentación del historial y del comprobante (specs historial y comprobantes).

const categoria = (c: string) => (esCategoria(c) ? NOMBRES_CATEGORIA[c] : c);

/** Tabla con desplazamiento horizontal propio para 360 px (design D6). */
function Tabla({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="relative overflow-x-auto rounded-card border border-border bg-card">
      <table className="w-full min-w-[34rem] text-sm">
        <caption className="sr-only">{titulo}</caption>
        {children}
      </table>
    </div>
  );
}

const th = 'px-4 py-3 text-left font-medium text-text-muted';
const td = 'px-4 py-3 border-t border-border';

export function TablaCompras({ compras }: { compras: ResumenCompra[] }) {
  return (
    <Tabla titulo="Mis compras">
      <thead>
        <tr>
          <th scope="col" className={th}>
            Fecha
          </th>
          <th scope="col" className={th}>
            Comprobante
          </th>
          <th scope="col" className={th}>
            Productos
          </th>
          <th scope="col" className={th}>
            Estado
          </th>
          <th scope="col" className={`${th} text-right`}>
            Total
          </th>
          <th scope="col" className={th}>
            <span className="sr-only">Acciones</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {compras.map((c) => (
          <tr key={c.id}>
            <td className={td}>{formatoFecha(c.fecha)}</td>
            <td className={`${td} font-mono`}>{c.comprobante?.numero ?? '—'}</td>
            <td className={td}>{c.productos}</td>
            <td className={td}>
              <Badge variante="exito">
                <CheckCircle2 strokeWidth={1.5} /> Pagada
              </Badge>
            </td>
            <td className={`${td} text-right font-display font-bold`}>{formatoPrecio(c.total)}</td>
            <td className={td}>
              <Link
                href={`/cuenta/compras/${c.id}`}
                className="text-primary-soft underline underline-offset-2"
                aria-label={`Ver detalle de la compra ${c.comprobante?.numero ?? ''}`.trim()}
              >
                Ver detalle
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}

export function VistaDetalleCompra({ compra }: { compra: DetalleCompra }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="flex flex-wrap items-center gap-3 text-sm text-text-muted">
        <span>{formatoFecha(compra.fecha)}</span>
        <Badge variante="exito">
          <CheckCircle2 strokeWidth={1.5} /> Pagada
        </Badge>
        {compra.comprobante && <span className="font-mono">{compra.comprobante.numero}</span>}
      </p>
      <Tabla titulo="Productos de la compra">
        <thead>
          <tr>
            <th scope="col" className={th}>
              Producto
            </th>
            <th scope="col" className={th}>
              Cantidad
            </th>
            <th scope="col" className={`${th} text-right`}>
              Precio
            </th>
            <th scope="col" className={`${th} text-right`}>
              Subtotal
            </th>
          </tr>
        </thead>
        <tbody>
          {compra.items.map((i) => (
            <tr key={i.producto.id}>
              <td className={td}>
                <span className="block">{i.producto.nombre}</span>
                <span className="text-xs text-text-muted">
                  {[i.producto.marca, categoria(i.producto.categoria)].filter(Boolean).join(' · ')}
                </span>
              </td>
              <td className={td}>{i.cantidad}</td>
              <td className={`${td} text-right`}>{formatoPrecio(i.precioUnitario)}</td>
              <td className={`${td} text-right`}>{formatoPrecio(i.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      <p className="flex items-baseline justify-end gap-3">
        <span className="text-sm text-text-muted">Total</span>
        <span className="font-display text-2xl font-bold">{formatoPrecio(compra.total)}</span>
      </p>
      {compra.comprobante && (
        <Button asChild variante="contorno" className="self-start">
          <Link href={`/cuenta/comprobantes/${compra.comprobante.id}`}>
            <FileText strokeWidth={1.5} /> Ver comprobante
          </Link>
        </Button>
      )}
    </div>
  );
}

/** Comprobante imprimible: al imprimir solo queda este bloque (spec comprobantes). */
export function VistaComprobante({
  comprobante,
  nueva,
  onImprimir,
}: {
  comprobante: Comprobante;
  nueva: boolean;
  onImprimir: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {nueva && (
        <p
          role="status"
          className="rounded-control border border-success/40 p-3 text-sm text-success print:hidden"
        >
          ¡Gracias por tu compra! Tu pago fue aprobado.
        </p>
      )}
      <article
        aria-label={`Comprobante ${comprobante.numero}`}
        className="flex flex-col gap-5 rounded-card border border-border bg-card p-6 print:border-0 print:p-0"
      >
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-display text-2xl font-bold">XDTech</p>
            <p className="text-sm text-text-muted">Componentes y equipos · Ayacucho</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-text-muted">Comprobante de compra</p>
            <p className="font-mono text-xl font-bold">{comprobante.numero}</p>
            <p className="text-sm">{formatoFecha(comprobante.fecha)}</p>
          </div>
        </header>
        <p className="text-sm">
          <span className="text-text-muted">Cliente: </span>
          {comprobante.cliente}
        </p>
        <Tabla titulo={`Detalle del comprobante ${comprobante.numero}`}>
          <thead>
            <tr>
              <th scope="col" className={th}>
                Producto
              </th>
              <th scope="col" className={th}>
                Cantidad
              </th>
              <th scope="col" className={`${th} text-right`}>
                Precio unitario
              </th>
              <th scope="col" className={`${th} text-right`}>
                Subtotal
              </th>
            </tr>
          </thead>
          <tbody>
            {comprobante.items.map((i) => (
              <tr key={i.productoId}>
                <td className={td}>{i.nombre}</td>
                <td className={td}>{i.cantidad}</td>
                <td className={`${td} text-right`}>{formatoPrecio(i.precioUnitario)}</td>
                <td className={`${td} text-right`}>{formatoPrecio(i.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-sm text-text-muted">
            {comprobante.tarjeta
              ? `Pagado con tarjeta terminada en ${comprobante.tarjeta.ultimos4} (pago simulado)`
              : 'Pago simulado'}
          </p>
          <p className="flex items-baseline gap-3">
            <span className="text-sm text-text-muted">Total</span>
            <span className="font-display text-2xl font-bold">
              {formatoPrecio(comprobante.total)}
            </span>
          </p>
        </div>
      </article>
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button type="button" onClick={onImprimir}>
          <Printer strokeWidth={1.5} /> Imprimir
        </Button>
        <Button asChild variante="contorno">
          <Link href={`/cuenta/compras/${comprobante.ordenId}`}>Ver la compra</Link>
        </Button>
        <Button asChild variante="fantasma">
          <Link href="/cuenta/compras">Mis compras</Link>
        </Button>
      </div>
    </div>
  );
}

const ESTADOS: Record<string, { texto: string; variante: 'exito' | 'peligro' | 'neutra' }> = {
  VALIDA: { texto: 'Compatible', variante: 'exito' },
  INVALIDA: { texto: 'Incompatible', variante: 'peligro' },
  BORRADOR: { texto: 'Borrador', variante: 'neutra' },
};

export function TarjetaConfiguracion({
  configuracion: c,
  revalidando,
  resultado,
  onRevalidar,
}: {
  configuracion: ConfiguracionHistorial;
  revalidando: boolean;
  resultado: Revalidacion | null;
  onRevalidar: () => void;
}) {
  const estado = ESTADOS[c.estado] ?? { texto: c.estado, variante: 'neutra' as const };
  const nombre = (id: string) => c.componentes.find((x) => x.productoId === id)?.nombre ?? id;
  return (
    <li className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variante={c.origen === 'IA' ? 'ia' : 'neutra'}>
          {c.origen === 'IA' ? <Sparkles strokeWidth={1.5} /> : <Wrench strokeWidth={1.5} />}
          {c.origen === 'IA' ? 'Asistente IA' : 'Manual'}
        </Badge>
        <Badge variante={estado.variante}>{estado.texto}</Badge>
        <span className="text-sm text-text-muted">{formatoFecha(c.creadaEn, true)}</span>
      </div>
      {(c.presupuesto || c.uso) && (
        <p className="text-sm text-text-muted">
          {c.presupuesto && <>Presupuesto: {formatoPrecio(c.presupuesto)}</>}
          {c.presupuesto && c.uso && ' · '}
          {c.uso && <>Uso: {c.uso}</>}
        </p>
      )}
      <ul className="text-sm" aria-label="Componentes">
        {c.componentes.map((x) => (
          <li key={x.productoId}>
            <span className="text-text-muted">{categoria(x.categoria)}:</span>{' '}
            {x.cantidad > 1 ? `${x.cantidad} × ` : ''}
            {x.nombre}
          </li>
        ))}
      </ul>
      {resultado && (
        <div
          role="status"
          className="flex flex-col gap-1 rounded-control border border-border p-3 text-sm"
        >
          {resultado.agregable ? (
            <p className="flex items-center gap-2 text-success">
              <CheckCircle2 className="size-4" strokeWidth={1.5} aria-hidden="true" />
              Sigue compatible y con stock: puedes agregarla al carrito desde el armador.
            </p>
          ) : (
            <>
              <p className="flex items-center gap-2 text-warning">
                <XCircle className="size-4" strokeWidth={1.5} aria-hidden="true" />
                No se puede agregar al carrito tal como está.
              </p>
              <ul className="list-disc pl-5 text-text-muted">
                {resultado.rechazos.map((r) => (
                  <li key={r.codigo + r.productos.join()}>{r.mensaje}</li>
                ))}
                {resultado.faltantes.map((f) => (
                  <li key={f.productoId}>
                    Sin stock suficiente de {nombre(f.productoId)} (quedan {f.disponible}).
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variante="contorno"
          tamano="sm"
          disabled={revalidando}
          onClick={onRevalidar}
        >
          <RefreshCw strokeWidth={1.5} /> {revalidando ? 'Revalidando…' : 'Revalidar'}
        </Button>
        <Button asChild tamano="sm">
          <Link href={`/armador?config=${c.id}`}>Abrir en el armador</Link>
        </Button>
      </div>
    </li>
  );
}

/** Paginación simple: anterior y siguiente. */
export function Paginacion({
  pagina,
  total,
  porPagina = 20,
  onCambiar,
}: {
  pagina: number;
  total: number;
  porPagina?: number;
  onCambiar: (p: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return null;
  return (
    <nav aria-label="Paginación" className="flex items-center gap-3">
      <Button
        type="button"
        variante="contorno"
        tamano="sm"
        disabled={pagina <= 1}
        onClick={() => onCambiar(pagina - 1)}
      >
        Anterior
      </Button>
      <span className="text-sm text-text-muted">
        Página {pagina} de {paginas}
      </span>
      <Button
        type="button"
        variante="contorno"
        tamano="sm"
        disabled={pagina >= paginas}
        onClick={() => onCambiar(pagina + 1)}
      >
        Siguiente
      </Button>
    </nav>
  );
}
