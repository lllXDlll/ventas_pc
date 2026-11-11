import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { env } from 'cloudflare:workers';
import { conPrisma } from '../datos/prisma';
import { Prisma, type Rol } from '../generated/prisma/client';
import { hashContrasena, verificarContraFicticio, verificarContrasena } from './contrasenas';
import { LimitesService } from './limites.service';
import { type ConfigSesion, hashToken, leerConfigSesion, nuevoToken } from './sesiones';

export interface UsuarioPublico {
  id: string;
  correo: string;
  rol: Rol;
}

export interface SesionCreada {
  usuario: UsuarioPublico;
  token: string;
  maxAgeMs: number;
}

/** Usuario y sesión resueltos a partir de la cookie (para las guardas). */
export interface SesionActual {
  sesionId: string;
  usuario: UsuarioPublico;
}

const DIA_MS = 86_400_000;
const CREDENCIALES_INVALIDAS = {
  codigo: 'CREDENCIALES_INVALIDAS',
  mensaje: 'Correo o contraseña incorrectos.',
};

/**
 * Registro, sesiones y cierre de sesión (spec autenticacion, design.md D2 y D3).
 * Todas las consultas de una petición comparten su conexión (enPeticion, D1).
 */
@Injectable()
export class AuthService {
  private readonly config: ConfigSesion = leerConfigSesion(
    env as unknown as Record<string, unknown>,
  );

  constructor(private readonly limites: LimitesService) {}

  get configSesion(): ConfigSesion {
    return this.config;
  }

  async registrar(
    correo: string,
    contrasena: string,
    ip: string | undefined,
  ): Promise<UsuarioPublico> {
    await this.limites.registro(ip);
    const hash = await hashContrasena(contrasena);
    try {
      return await conPrisma((p) =>
        p.usuario.create({
          data: { correo, hashContrasena: hash },
          select: { id: true, correo: true, rol: true },
        }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          codigo: 'CORREO_REGISTRADO',
          mensaje: 'Ese correo ya está registrado. Inicia sesión o usa otro correo.',
        });
      }
      throw error;
    }
  }

  async iniciarSesion(
    correo: string,
    contrasena: string,
    ip: string | undefined,
  ): Promise<SesionCreada> {
    await this.limites.antesDeLogin(correo, ip);

    const usuario = await conPrisma((p) =>
      p.usuario.findUnique({
        where: { correo },
        select: { id: true, correo: true, rol: true, estado: true, hashContrasena: true },
      }),
    );
    // Sin cuenta se calcula igual un PBKDF2: el tiempo no revela si el correo existe.
    const valida = usuario
      ? await verificarContrasena(contrasena, usuario.hashContrasena)
      : await verificarContraFicticio(contrasena);
    if (!usuario || !valida || usuario.estado !== 'ACTIVO') {
      await this.limites.falloDeLogin(correo);
      throw new UnauthorizedException(CREDENCIALES_INVALIDAS);
    }

    await this.limites.loginCorrecto(correo);
    const token = nuevoToken();
    const maxAgeMs = this.config.ttlDias * DIA_MS;
    const ahora = new Date();
    await conPrisma(async (p) => {
      // Limpieza propia: vencidas o revocadas de este usuario (spec autenticacion).
      await p.sesion.deleteMany({
        where: { usuarioId: usuario.id, OR: [{ venceEn: { lte: ahora } }, { revocada: true }] },
      });
      await p.sesion.create({
        data: {
          usuarioId: usuario.id,
          tokenHash: await hashToken(token),
          venceEn: new Date(ahora.getTime() + maxAgeMs),
        },
      });
    });
    return {
      usuario: { id: usuario.id, correo: usuario.correo, rol: usuario.rol },
      token,
      maxAgeMs,
    };
  }

  /** Sesión válida para el token, o null si no existe, venció, está revocada o la cuenta no está ACTIVA. */
  async resolverSesion(token: string | undefined): Promise<SesionActual | null> {
    if (!token) return null;
    const sesion = await conPrisma(async (p) =>
      p.sesion.findUnique({
        where: { tokenHash: await hashToken(token) },
        select: {
          id: true,
          venceEn: true,
          revocada: true,
          usuario: { select: { id: true, correo: true, rol: true, estado: true } },
        },
      }),
    );
    if (!sesion || sesion.revocada || sesion.venceEn <= new Date()) return null;
    if (sesion.usuario.estado !== 'ACTIVO') return null;
    const { id, correo, rol } = sesion.usuario;
    return { sesionId: sesion.id, usuario: { id, correo, rol } };
  }

  async cerrarSesion(sesionId: string): Promise<void> {
    await conPrisma((p) =>
      p.sesion.update({
        where: { id: sesionId },
        data: { revocada: true, revocadaEn: new Date() },
      }),
    );
  }
}
