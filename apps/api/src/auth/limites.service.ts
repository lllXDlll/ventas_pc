import { Injectable } from '@nestjs/common';
import { env } from 'cloudflare:workers';
import { DemasiadasPeticiones } from '../comun/errores';
import { clavePorIp } from './ip';
import type { Decision, Limites } from './limites';
import { type ConfigLimites, leerConfigLimites } from './limites.config';

/**
 * Límites de registro e inicio de sesión (spec limite-peticiones, design.md D5).
 * Cada clave vive en su propio Durable Object Limites; cada llamada es 1 subrequest.
 */
@Injectable()
export class LimitesService {
  private readonly config: ConfigLimites = leerConfigLimites(
    env as unknown as Record<string, unknown>,
  );

  private objeto(clave: string) {
    const ns = env.LIMITES as DurableObjectNamespace<Limites>;
    return ns.get(ns.idFromName(clave));
  }

  private exigir(decision: Decision): void {
    if (!decision.permitido) throw new DemasiadasPeticiones(decision.reintentarEnS);
  }

  /** Cuenta un intento de registro de esta IP; 429 si ya superó el límite. */
  async registro(ip: string | undefined): Promise<void> {
    const { max, ventanaMs } = this.config.registro;
    this.exigir(await this.objeto(`registro:ip:${clavePorIp(ip)}`).consumir(max, ventanaMs));
  }

  /**
   * Antes de verificar la contraseña: cuenta el intento de la IP (aciertos y fallos) y
   * comprueba, sin contar, los fallos del correo. 429 si alguno superó su límite.
   */
  async antesDeLogin(correo: string, ip: string | undefined): Promise<void> {
    const porIp = this.config.loginIp;
    const porCorreo = this.config.loginCorreo;
    const [ipDecision, correoDecision] = await Promise.all([
      this.objeto(`login:ip:${clavePorIp(ip)}`).consumir(porIp.max, porIp.ventanaMs),
      this.objeto(claveCorreo(correo)).consultar(porCorreo.max, porCorreo.ventanaMs),
    ]);
    this.exigir(ipDecision);
    this.exigir(correoDecision);
  }

  async falloDeLogin(correo: string): Promise<void> {
    await this.objeto(claveCorreo(correo)).registrarFallo(this.config.loginCorreo.ventanaMs);
  }

  async loginCorrecto(correo: string): Promise<void> {
    await this.objeto(claveCorreo(correo)).reiniciar();
  }
}

function claveCorreo(correo: string): string {
  return `login:correo:${correo.trim().toLowerCase()}`;
}
