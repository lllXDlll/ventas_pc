'use client';

import { Plus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { EstadoError } from '@/components/ui/estado';
import { ErrorApi, mensajeDeError } from '@/lib/api-client';
import { tipoDeCategoria } from '@/lib/atributos';
import type { ProductoAdmin } from '@/lib/tipos';
import {
  actualizarProducto,
  actualizarStock,
  crearProducto,
  type FiltrosAdmin,
  opcionesProductosAdmin,
  quitarImagen,
  subirImagen,
} from '../api';
import { ImagenEditor, ProductoForm } from '../components/producto-form';
import { ProductosTable } from '../components/productos-table';
import { atributosDe, type DatosProducto } from '../schemas';

type Aviso = { tipo: 'exito' | 'alerta'; texto: string } | null;

/** Panel de catálogo (specs catalogo e imagenes-producto). Solo se monta para un ADMIN. */
export function PanelContenedor() {
  const cliente = useQueryClient();
  const [filtros, setFiltros] = useState<FiltrosAdmin>({});
  const filtrosDiferidos = useDeferredValue(filtros);
  const lista = useQuery(opcionesProductosAdmin(filtrosDiferidos));
  const [aviso, setAviso] = useState<Aviso>(null);
  const [creando, setCreando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const editando = lista.data?.productos.find((p) => p.id === editandoId) ?? null;

  const refrescar = () => cliente.invalidateQueries({ queryKey: ['admin', 'productos'] });
  /** Reemplaza el producto en todas las listas en caché, sin esperar otra consulta. */
  const reemplazar = (p: ProductoAdmin) =>
    cliente.setQueriesData<{ productos: ProductoAdmin[] }>(
      { queryKey: ['admin', 'productos'] },
      (d) => d && { ...d, productos: d.productos.map((x) => (x.id === p.id ? p : x)) },
    );

  const crear = useMutation({
    mutationFn: (d: DatosProducto) =>
      crearProducto({
        nombre: d.nombre,
        marca: d.marca,
        categoria: d.categoria,
        tipo: tipoDeCategoria(d.categoria),
        precio: d.precio,
        stockInicial: Number(d.stockInicial),
        atributos: atributosDe(d.categoria, d.atributos, d.descripcion),
      }),
    onSuccess: async (p) => {
      setCreando(false);
      setAviso({ tipo: 'exito', texto: `Se creó «${p.nombre}».` });
      await refrescar();
    },
  });

  const editar = useMutation({
    mutationFn: ({ p, d }: { p: ProductoAdmin; d: DatosProducto }) =>
      actualizarProducto(p.id, {
        nombre: d.nombre,
        marca: d.marca,
        precio: d.precio,
        activo: d.activo,
        atributos: atributosDe(p.categoria.codigo, d.atributos, d.descripcion),
      }),
    onSuccess: (p) => {
      reemplazar(p);
      setEditandoId(null);
      setAviso({ tipo: 'exito', texto: `Cambios guardados: «${p.nombre}».` });
    },
  });

  const stock = useMutation({
    mutationFn: ({ p, cantidad }: { p: ProductoAdmin; cantidad: number }) =>
      actualizarStock(p.id, cantidad, p.stock.version),
    onSuccess: (vigente, { p }) => {
      reemplazar({
        ...p,
        stock: vigente,
        disponible: vigente.cantidad,
        agotado: vigente.cantidad === 0,
      });
      setAviso({ tipo: 'exito', texto: `Stock guardado: «${p.nombre}».` });
    },
    onError: (e, { p }) => {
      if (e instanceof ErrorApi && e.codigo === 'CONFLICTO' && e.detalle) {
        const vigente = e.detalle as { cantidad: number; version: number };
        reemplazar({ ...p, stock: vigente });
        setAviso({
          tipo: 'alerta',
          texto: `${e.message} Cantidad vigente: ${vigente.cantidad} (versión ${vigente.version}).`,
        });
        return;
      }
      setAviso({ tipo: 'alerta', texto: mensajeDeError(e) });
    },
  });

  const imagen = useMutation({
    mutationFn: async ({ p, archivo }: { p: ProductoAdmin; archivo: File | null }) => {
      if (archivo) return { p, imagenUrl: (await subirImagen(p.id, archivo)).imagenUrl };
      await quitarImagen(p.id);
      return { p, imagenUrl: null };
    },
    onSuccess: ({ p, imagenUrl }) => {
      reemplazar({ ...p, imagenUrl });
      setAviso({
        tipo: 'exito',
        texto: imagenUrl ? `Imagen guardada: «${p.nombre}».` : `Imagen quitada: «${p.nombre}».`,
      });
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl">Panel de catálogo</h1>
          <p className="text-sm text-text-muted">
            {lista.data ? `${lista.data.total} productos` : 'Productos, precios, stock e imágenes'}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            crear.reset();
            setCreando(true);
          }}
        >
          <Plus strokeWidth={1.5} /> Nuevo producto
        </Button>
      </div>

      <p
        role="status"
        className={aviso?.tipo === 'alerta' ? 'text-sm text-warning' : 'text-sm text-success'}
      >
        {aviso?.texto ?? ''}
      </p>

      {lista.isError ? (
        <EstadoError
          mensaje={mensajeDeError(lista.error, 'No se pudo cargar la lista de productos.')}
          onReintentar={() => void lista.refetch()}
        />
      ) : (
        <ProductosTable
          productos={lista.data?.productos}
          cargando={lista.isPending}
          filtros={filtros}
          onFiltrar={setFiltros}
          onEditar={(p) => {
            editar.reset();
            imagen.reset();
            setEditandoId(p.id);
          }}
          onGuardarStock={(p, cantidad) => stock.mutate({ p, cantidad })}
          guardandoStock={stock.isPending ? (stock.variables?.p.id ?? null) : null}
        />
      )}

      <Dialog open={creando} onOpenChange={setCreando}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogTitle>Nuevo producto</DialogTitle>
          <DialogDescription className="mb-4">
            Podrás subir la imagen después de crearlo, desde «Editar».
          </DialogDescription>
          <ProductoForm
            enviando={crear.isPending}
            error={crear.isError ? mensajeDeError(crear.error) : null}
            onEnviar={(d) => crear.mutate(d)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={editando !== null} onOpenChange={(abierto) => !abierto && setEditandoId(null)}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogTitle>Editar producto</DialogTitle>
          <DialogDescription className="mb-4">{editando?.nombre}</DialogDescription>
          {editando && (
            <div className="flex flex-col gap-4">
              <ProductoForm
                key={editando.id}
                producto={editando}
                enviando={editar.isPending}
                error={editar.isError ? mensajeDeError(editar.error) : null}
                onEnviar={(d) => editar.mutate({ p: editando, d })}
              />
              <ImagenEditor
                producto={editando}
                ocupado={imagen.isPending}
                error={imagen.isError ? mensajeDeError(imagen.error) : null}
                onSubir={(archivo) => imagen.mutate({ p: editando, archivo })}
                onQuitar={() => imagen.mutate({ p: editando, archivo: null })}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
