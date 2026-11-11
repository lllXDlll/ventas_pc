import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, type SesionActual, type UsuarioPublico } from './auth.service';
import { LoginDto, RegistroDto } from './dto';
import { RequiereSesion, SesionDeLaPeticion } from './guardas';
import { ipDelCliente } from './ip';
import { COOKIE_SESION, opcionesCookie } from './sesiones';

/** Registro y sesión (spec autenticacion). La IP sale solo de CF-Connecting-IP. */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('registro')
  @HttpCode(201)
  registrar(@Body() cuerpo: RegistroDto, @Req() req: Request): Promise<UsuarioPublico> {
    return this.auth.registrar(cuerpo.correo, cuerpo.contrasena, ipDelCliente(req.headers));
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() cuerpo: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UsuarioPublico> {
    const sesion = await this.auth.iniciarSesion(
      cuerpo.correo,
      cuerpo.contrasena,
      ipDelCliente(req.headers),
    );
    res.cookie(COOKIE_SESION, sesion.token, {
      ...opcionesCookie(this.auth.configSesion),
      maxAge: sesion.maxAgeMs,
    });
    return sesion.usuario;
  }

  @Get('me')
  @RequiereSesion()
  me(@SesionDeLaPeticion() sesion: SesionActual): UsuarioPublico {
    return sesion.usuario;
  }

  @Post('logout')
  @HttpCode(204)
  @RequiereSesion()
  async logout(
    @SesionDeLaPeticion() sesion: SesionActual,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.cerrarSesion(sesion.sesionId);
    res.clearCookie(COOKIE_SESION, opcionesCookie(this.auth.configSesion));
  }
}
