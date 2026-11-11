// Tipos de las respuestas de la API compartidos por varias funcionalidades
// (specs catalogo, autenticacion e imagenes-producto).
import type { CodigoCategoria } from './atributos';

export interface Usuario {
  id: string;
  correo: string;
  rol: 'CLIENTE' | 'ADMIN';
}

export interface Categoria {
  codigo: CodigoCategoria;
  nombre: string;
}

export interface Producto {
  id: string;
  nombre: string;
  /** Nula solo en productos anteriores al Sprint 1.5 que aún no la tienen. */
  marca: string | null;
  categoria: Categoria;
  tipo: 'COMPONENTE' | 'EQUIPO';
  /** Texto decimal ("1299.00"). */
  precio: string;
  disponible: number;
  agotado: boolean;
  atributos: Record<string, unknown>;
  /** Ruta relativa en la API, o null si no tiene imagen. */
  imagenUrl: string | null;
}

export interface ProductoAdmin extends Producto {
  activo: boolean;
  stock: { cantidad: number; version: number };
}

export interface Pagina<T> {
  productos: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

export interface Faceta {
  valor: string;
  cantidad: number;
}

export interface Facetas {
  marcas: Faceta[];
  sockets: Faceta[];
  precio: { min: string; max: string } | null;
}
