import { BadRequestException, Injectable } from '@nestjs/common';
import { rutaImagen } from '../catalogo/catalogo.service';
import { conPrisma } from '../datos/prisma';
import type { Prisma } from '../generated/prisma/client';
import { DisponibleService } from '../reservas/disponible.service';
import type { ItemDto } from './dto';
import { type ConfigRegla, evaluar, type Resultado } from './motor/orquestador';
import type { CodigoRegla } from './motor/parametros';
import type { CategoriaPieza, Pieza } from './motor/tipos';

/** Categorías de las que una configuración admite una sola pieza, con cantidad 1. */
const UNICAS: readonly CategoriaPieza[] = [
  'PROCESADOR',
  'PLACA_MADRE',
  'TARJETA_GRAFICA',
  'FUENTE',
  'GABINETE',
];

const NOMBRE_UNICA: Record<string, string> = {
  PROCESADOR: 'un procesador',
  PLACA_MADRE: 'una placa madre',
  TARJETA_GRAFICA: 'una tarjeta gráfica',
  FUENTE: 'una fuente',
  GABINETE: 'un gabinete',
};

const seleccion = {
  id: true,
  nombre: true,
  marca: true,
  precio: true,
  activo: true,
  atributos: true,
  imagenClave: true,
  categoria: { select: { codigo: true, nombre: true } },
  stock: { select: { cantidad: true } },
} satisfies Prisma.ProductoSelect;

/** Producto de una configuración, tal como lo devuelve la API. */
export interface ProductoDeConfiguracion {
  id: string;
  nombre: string;
  marca: string | null;
  categoria: { codigo: string; nombre: string };
  precio: string;
  activo: boolean;
  disponible: number;
  atributos: Record<string, unknown>;
  imagenUrl: string | null;
}

export interface Evaluacion extends Resultado {
  items: { producto: ProductoDeConfiguracion; cantidad: number }[];
}

function invalida(mensaje: string): BadRequestException {
  return new BadRequestException({ codigo: 'SOLICITUD_INVALIDA', mensaje });
}

/**
 * Puerta del motor hacia la base (design D4 del Sprint 2): dos consultas (productos y
 * reglas), validación de entrada y composición, y el motor puro.
 */
@Injectable()
export class CompatibilidadService {
  constructor(private readonly disponible: DisponibleService) {}

  /**
   * estricto: rechaza productos inactivos (al validar o guardar). Sin estricto (al leer una
   * configuración guardada) se evalúan igual y quedan como no disponibles.
   */
  async evaluar(items: readonly ItemDto[], { estricto = true } = {}): Promise<Evaluacion> {
    const ids = items.map((i) => i.productoId);
    if (new Set(ids).size !== ids.length) {
      throw invalida('Un producto aparece repetido: usa la cantidad en lugar de repetirlo.');
    }
    const [filas, reglas] = ids.length
      ? await conPrisma(async (p) => [
          await p.producto.findMany({ where: { id: { in: ids } }, select: seleccion }),
          await p.reglaCompatibilidad.findMany({
            select: { codigo: true, activa: true, parametros: true },
          }),
        ])
      : [[], []];

    const porId = new Map(filas.map((f) => [f.id, f]));
    const cuentaPorCategoria = new Map<string, number>();
    for (const item of items) {
      const fila = porId.get(item.productoId);
      if (!fila) throw invalida(`El producto ${item.productoId} no existe.`);
      if (estricto && !fila.activo)
        throw invalida(`El producto «${fila.nombre}» no está disponible.`);
      const categoria = fila.categoria.codigo;
      if (categoria === 'EQUIPO_ARMADO') {
        throw invalida(`«${fila.nombre}» es un equipo armado: no se combina en una configuración.`);
      }
      if ((UNICAS as readonly string[]).includes(categoria)) {
        if (item.cantidad !== 1) throw invalida(`Elige solo ${NOMBRE_UNICA[categoria]}.`);
        cuentaPorCategoria.set(categoria, (cuentaPorCategoria.get(categoria) ?? 0) + 1);
        if ((cuentaPorCategoria.get(categoria) ?? 0) > 1) {
          throw invalida(`Una configuración admite solo ${NOMBRE_UNICA[categoria]}.`);
        }
      }
    }

    const mapa = await this.disponible.disponibles(
      filas.map((f) => ({ productoId: f.id, stockFisico: f.stock?.cantidad ?? 0 })),
    );
    const evaluados = items.map((item) => {
      const f = porId.get(item.productoId)!;
      const producto: ProductoDeConfiguracion = {
        id: f.id,
        nombre: f.nombre,
        marca: f.marca,
        categoria: f.categoria,
        precio: f.precio.toFixed(2),
        activo: f.activo,
        disponible: f.activo ? (mapa.get(f.id) ?? 0) : 0,
        atributos: (f.atributos ?? {}) as Record<string, unknown>,
        imagenUrl: rutaImagen(f.id, f.imagenClave),
      };
      return { producto, cantidad: item.cantidad };
    });

    const piezas: Pieza[] = evaluados.map(({ producto, cantidad }) => ({
      id: producto.id,
      nombre: producto.nombre,
      categoria: producto.categoria.codigo as CategoriaPieza,
      atributos: producto.atributos,
      cantidad,
    }));
    const configuracion: ConfigRegla[] = reglas.map((r) => ({
      codigo: r.codigo as CodigoRegla,
      activa: r.activa,
      parametros: (r.parametros ?? {}) as Record<string, unknown>,
    }));
    return { ...evaluar(piezas, configuracion), items: evaluados };
  }
}
