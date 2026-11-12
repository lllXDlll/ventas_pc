import { randomUUID } from 'node:crypto';
import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { env } from 'cloudflare:workers';
import { conPrisma } from '../datos/prisma';
import { rutaImagen } from './catalogo.service';
import {
  archivoDeClave,
  claveImagen,
  extensionDeArchivo,
  MAX_BYTES_IMAGEN,
  TIPO_CONTENIDO,
  tipoImagen,
} from './imagenes';

const NO_EXISTE = { codigo: 'NO_ENCONTRADO', mensaje: 'El producto no existe.' };

export const DEMASIADO_GRANDE = new HttpException(
  {
    codigo: 'IMAGEN_DEMASIADO_GRANDE',
    mensaje: 'La imagen no puede pesar más de 2 MB.',
  },
  HttpStatus.PAYLOAD_TOO_LARGE,
);

const TIPO_NO_ADMITIDO = () =>
  new HttpException(
    {
      codigo: 'TIPO_NO_ADMITIDO',
      mensaje: 'La imagen debe ser JPEG, PNG o WebP.',
    },
    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  );

const esUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export interface ImagenServida {
  cuerpo: ReadableStream;
  tipo: string;
  etag: string;
}

/**
 * Imagen opcional de cada producto en R2 (design D9 del Sprint 1.5). Nunca toca el stock
 * ni otros datos del producto: solo la columna imagen_clave.
 */
@Injectable()
export class ImagenesService {
  private async claveActual(id: string): Promise<{ clave: string | null; activo: boolean }> {
    if (!esUuid(id)) throw new NotFoundException(NO_EXISTE);
    const fila = await conPrisma((p) =>
      p.producto.findFirst({ where: { id }, select: { imagenClave: true, activo: true } }),
    );
    if (!fila) throw new NotFoundException(NO_EXISTE);
    return { clave: fila.imagenClave, activo: fila.activo };
  }

  /** Orden: put de la clave nueva, UPDATE de la columna y borrado de la anterior. */
  async subir(id: string, bytes: Uint8Array): Promise<{ imagenUrl: string }> {
    const { clave: anterior } = await this.claveActual(id);
    if (bytes.byteLength > MAX_BYTES_IMAGEN) throw DEMASIADO_GRANDE;
    const ext = tipoImagen(bytes);
    if (!ext) throw TIPO_NO_ADMITIDO();

    const nueva = claveImagen(id, ext, randomUUID());
    await env.IMAGENES.put(nueva, bytes, { httpMetadata: { contentType: TIPO_CONTENIDO[ext] } });
    try {
      await conPrisma((p) => p.producto.update({ where: { id }, data: { imagenClave: nueva } }));
    } catch (error) {
      await env.IMAGENES.delete(nueva);
      throw error;
    }
    if (anterior) await this.borrarObjeto(anterior);
    return { imagenUrl: rutaImagen(id, nueva) ?? '' };
  }

  /** Primero la columna y después el objeto: el catálogo nunca apunta a una imagen borrada. */
  async quitar(id: string): Promise<void> {
    const { clave } = await this.claveActual(id);
    if (!clave) return;
    await conPrisma((p) => p.producto.update({ where: { id }, data: { imagenClave: null } }));
    await this.borrarObjeto(clave);
  }

  /** Solo productos activos y solo el archivo vigente. */
  async servir(id: string, archivo: string): Promise<ImagenServida> {
    const { clave, activo } = await this.claveActual(id);
    if (!activo || !clave || archivoDeClave(clave) !== archivo || !extensionDeArchivo(archivo)) {
      throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La imagen no existe.' });
    }
    const objeto = await env.IMAGENES.get(clave);
    if (!objeto) {
      throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La imagen no existe.' });
    }
    return {
      cuerpo: objeto.body,
      tipo: objeto.httpMetadata?.contentType ?? TIPO_CONTENIDO[extensionDeArchivo(archivo)!],
      etag: objeto.httpEtag,
    };
  }

  /** Un fallo al borrar deja un objeto huérfano sin efecto visible: se registra y se sigue. */
  private async borrarObjeto(clave: string): Promise<void> {
    try {
      await env.IMAGENES.delete(clave);
    } catch (error) {
      console.error(
        JSON.stringify({
          nivel: 'warn',
          mensaje: 'imagen huérfana en R2',
          clave,
          error: String(error),
        }),
      );
    }
  }
}
