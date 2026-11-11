import { Readable } from 'node:stream';
import { Controller, Delete, Get, HttpCode, Param, Put, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Roles } from '../auth/guardas';
import { MAX_BYTES_IMAGEN } from './imagenes';
import { DEMASIADO_GRANDE, ImagenesService } from './imagenes.service';

/**
 * Lee el cuerpo crudo (sin multipart ni multer) cortando en cuanto pasa del límite.
 * Se lee dentro del handler, así la guarda de rol corre antes de recibir ningún byte.
 */
async function leerCuerpo(req: Request): Promise<Uint8Array> {
  const declarado = Number(req.headers['content-length'] ?? 0);
  if (declarado > MAX_BYTES_IMAGEN) throw DEMASIADO_GRANDE;
  const partes: Uint8Array[] = [];
  let total = 0;
  for await (const parte of req as AsyncIterable<Uint8Array>) {
    total += parte.byteLength;
    if (total > MAX_BYTES_IMAGEN) throw DEMASIADO_GRANDE;
    partes.push(parte);
  }
  const cuerpo = new Uint8Array(total);
  let desde = 0;
  for (const parte of partes) {
    cuerpo.set(parte, desde);
    desde += parte.byteLength;
  }
  return cuerpo;
}

/** Subida y borrado: solo ADMIN, como todo /admin (spec autorizacion-roles). */
@Controller('admin')
@Roles('ADMIN')
export class AdminImagenesController {
  constructor(private readonly imagenes: ImagenesService) {}

  @Put('productos/:id/imagen')
  async subir(@Param('id') id: string, @Req() req: Request): Promise<{ imagenUrl: string }> {
    return this.imagenes.subir(id, await leerCuerpo(req));
  }

  @Delete('productos/:id/imagen')
  @HttpCode(204)
  async quitar(@Param('id') id: string): Promise<void> {
    await this.imagenes.quitar(id);
  }
}

/** Entrega pública con caché inmutable: cada imagen nueva tiene otra URL (design D9). */
@Controller()
export class ImagenesController {
  constructor(private readonly imagenes: ImagenesService) {}

  @Get('productos/:id/imagen/:archivo')
  async servir(
    @Param('id') id: string,
    @Param('archivo') archivo: string,
    @Res() res: Response,
  ): Promise<void> {
    const imagen = await this.imagenes.servir(id, archivo);
    res.status(200);
    res.setHeader('content-type', imagen.tipo);
    res.setHeader('etag', imagen.etag);
    res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    Readable.fromWeb(imagen.cuerpo as unknown as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
  }
}
