// TEMPORAL (Sprint 0, pruebas 5, 6 y 7 de HU-36b). Se elimina en la tarea 8.1.
// - Prueba 6: emitir y leer una cookie con Domain=COOKIE_DOMAIN desde el frontend.
// - Prueba 7: comparar CF-Connecting-IP con la IP del socket.
// - Prueba 5: costo de PBKDF2-SHA256 con Web Crypto. Protegido con PROTOTIPO_TOKEN
//   (consume CPU); sin token configurado o sin la cabecera correcta responde 404.
import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { env } from 'cloudflare:workers';
import type { Request, Response } from 'express';

export const COOKIE_PRUEBA = 'xd_prueba';
const MAX_ITERACIONES = 1_000_000;

function leerCookie(cabecera: string | undefined, nombre: string): string | null {
  for (const parte of (cabecera ?? '').split(';')) {
    const [clave, ...valor] = parte.trim().split('=');
    if (clave === nombre) return decodeURIComponent(valor.join('='));
  }
  return null;
}

@Controller('__prueba')
export class PruebasPlataformaController {
  @Post('cookie')
  @HttpCode(200)
  emitirCookie(@Res({ passthrough: true }) res: Response): {
    emitida: string;
    domain: string | null;
  } {
    const dominio = env.COOKIE_DOMAIN || undefined;
    const valor = crypto.randomUUID();
    res.cookie(COOKIE_PRUEBA, valor, {
      httpOnly: true,
      // En local (sin dominio) se sirve por http, así que la cookie no puede ser Secure.
      secure: dominio !== undefined,
      sameSite: 'lax',
      domain: dominio,
      path: '/',
      maxAge: 10 * 60_000,
    });
    return { emitida: valor, domain: dominio ?? null };
  }

  @Get('cookie')
  leerCookie(@Headers('cookie') cookie: string | undefined): { recibida: string | null } {
    return { recibida: leerCookie(cookie, COOKIE_PRUEBA) };
  }

  @Get('ip')
  ip(@Req() req: Request): {
    cfConnectingIp: string | null;
    socket: string | null;
    xForwardedFor: string | null;
  } {
    return {
      cfConnectingIp: req.header('cf-connecting-ip') ?? null,
      socket: req.socket.remoteAddress ?? null,
      xForwardedFor: req.header('x-forwarded-for') ?? null,
    };
  }

  @Get('pbkdf2')
  async pbkdf2(
    @Headers('x-prototipo-token') token: string | undefined,
    @Query('iteraciones') iteracionesTexto: string,
  ): Promise<{ iteraciones: number; ok: boolean; error?: string; esperaMs: number }> {
    const esperado = (env as unknown as { PROTOTIPO_TOKEN?: string }).PROTOTIPO_TOKEN;
    if (!esperado || token !== esperado) throw new NotFoundException();
    const iteraciones = Number(iteracionesTexto);
    if (!Number.isInteger(iteraciones) || iteraciones < 1 || iteraciones > MAX_ITERACIONES) {
      throw new BadRequestException({
        codigo: 'SOLICITUD_INVALIDA',
        mensaje: `iteraciones debe ser un entero entre 1 y ${MAX_ITERACIONES}`,
      });
    }
    const sal = crypto.getRandomValues(new Uint8Array(16));
    const clave = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('contraseña de prueba'),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    // En Workers el reloj no avanza durante el cómputo: esperaMs es orientativo.
    // La CPU real se lee en wrangler tail (cpuTime) o en las métricas del Worker.
    const inicio = Date.now();
    try {
      await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones },
        clave,
        256,
      );
      return { iteraciones, ok: true, esperaMs: Date.now() - inicio };
    } catch (error) {
      // Se espera un error por encima del máximo de iteraciones del runtime.
      return { iteraciones, ok: false, error: String(error), esperaMs: Date.now() - inicio };
    }
  }
}
