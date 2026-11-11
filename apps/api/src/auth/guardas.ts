// Protección por sesión y por rol (spec autorizacion-roles, design.md D7 del Sprint 1).
// Una guarda global lee los metadatos: las rutas sin decorador son públicas. El rol se
// obtiene en cada petición de la cuenta asociada a la sesión, nunca del cliente.
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Rol } from '../generated/prisma/client';
import { AuthService, type SesionActual } from './auth.service';
import { tokenDeCookie } from './sesiones';

const CLAVE_SESION = 'auth:requiere-sesion';
const CLAVE_ROLES = 'auth:roles';

/** La ruta exige una sesión válida (401 si no la hay). */
export const RequiereSesion = () => SetMetadata(CLAVE_SESION, true);

/** La ruta exige sesión y uno de los roles indicados (401 sin sesión, 403 con otro rol). */
export const Roles = (...roles: Rol[]) =>
  applyDecorators(SetMetadata(CLAVE_SESION, true), SetMetadata(CLAVE_ROLES, roles));

type PeticionConSesion = Request & { sesion?: SesionActual };

/** La sesión resuelta por la guarda (solo en rutas con @RequiereSesion o @Roles). */
export const SesionDeLaPeticion = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): SesionActual => {
    const sesion = ctx.switchToHttp().getRequest<PeticionConSesion>().sesion;
    if (!sesion) throw new UnauthorizedException(SIN_SESION);
    return sesion;
  },
);

const SIN_SESION = { codigo: 'NO_AUTENTICADO', mensaje: 'Inicia sesión para continuar.' };
const SIN_PERMISO = { codigo: 'SIN_PERMISO', mensaje: 'No tienes permiso para esta acción.' };

@Injectable()
export class GuardaAutenticacion implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const objetivos = [ctx.getHandler(), ctx.getClass()];
    const requiereSesion = this.reflector.getAllAndOverride<boolean>(CLAVE_SESION, objetivos);
    if (!requiereSesion) return true;

    const peticion = ctx.switchToHttp().getRequest<PeticionConSesion>();
    const sesion = await this.auth.resolverSesion(tokenDeCookie(peticion.headers.cookie));
    if (!sesion) throw new UnauthorizedException(SIN_SESION);
    peticion.sesion = sesion;

    const roles = this.reflector.getAllAndOverride<Rol[] | undefined>(CLAVE_ROLES, objetivos);
    if (roles && !roles.includes(sesion.usuario.rol)) throw new ForbiddenException(SIN_PERMISO);
    return true;
  }
}
