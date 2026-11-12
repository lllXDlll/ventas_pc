import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { env } from 'cloudflare:workers';
import type { ConfigRegla } from '../compatibilidad/motor/orquestador';
import type { CodigoRegla } from '../compatibilidad/motor/parametros';
import type { CategoriaPieza } from '../compatibilidad/motor/tipos';
import {
  ConfiguracionesService,
  type VistaConfiguracion,
} from '../configuraciones/configuraciones.service';
import { conPrisma } from '../datos/prisma';
import type { Prisma } from '../generated/prisma/client';
import { DisponibleService } from '../reservas/disponible.service';
import { armar, masBarata } from './armador-deterministico';
import { validarRecomendacion } from './esquema';
import { LimiteAsistenteService } from './limite.service';
import { resumenDe } from './plantillas';
import { preseleccionar } from './preseleccion';
import type { MotivoFallo, ProveedorIA, ResultadoIA, SolicitudIA } from './proveedor';
import { ProveedorAnthropic } from './proveedor-anthropic';
import { ProveedorSimulado } from './proveedor-simulado';
import { aCentimos, aSoles, type ItemRecomendado, type ProductoAsistente, type Uso } from './tipos';
import { totalCent } from './validacion';

export interface Recomendacion {
  configuracion: VistaConfiguracion;
  explicaciones: Record<string, string>;
  resumen: string;
  respaldo: boolean;
  consultas: { usadas: number; limite: number };
}

/** Margen sobre el timeout del SDK: si aun así no vuelve, se corta aquí (spec: +2 s). */
const MARGEN_TIMEOUT_MS = 1500;

export function timeoutIA(valor = env.IA_TIMEOUT_MS): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : 20_000;
}

const espera = <T>(ms: number, valor: T) =>
  new Promise<T>((resolver) => setTimeout(() => resolver(valor), ms));

/**
 * Orquestador del asistente (spec asistente, design D6 y D10 del Sprint 5): mínimo, límite,
 * preselección, IA con un único reintento, respaldo determinístico, guardado y registro.
 */
@Injectable()
export class AsistenteService {
  private readonly anthropic = new ProveedorAnthropic(() => ({
    gatewayUrl: env.IA_GATEWAY_URL,
    token: env.CF_AIG_TOKEN,
    modelo: env.IA_MODELO || 'claude-opus-5-5',
  }));

  constructor(
    private readonly disponible: DisponibleService,
    private readonly configuraciones: ConfiguracionesService,
    private readonly limite: LimiteAsistenteService,
  ) {}

  /** El proveedor y si se honra el escenario de pruebas (solo con el simulado). */
  private proveedor(reglas: readonly ConfigRegla[]): { proveedor: ProveedorIA; simulado: boolean } {
    return env.IA_PROVEEDOR === 'simulado'
      ? { proveedor: new ProveedorSimulado(() => reglas), simulado: true }
      : { proveedor: this.anthropic, simulado: false };
  }

  /** Componentes activos con disponible > 0 y las reglas vigentes: una consulta y 1 DO. */
  private async catalogo(): Promise<{ productos: ProductoAsistente[]; reglas: ConfigRegla[] }> {
    const [filas, reglas] = await conPrisma(async (p) => [
      await p.producto.findMany({
        where: { activo: true, tipo: 'COMPONENTE' },
        select: {
          id: true,
          nombre: true,
          marca: true,
          precio: true,
          atributos: true,
          categoria: { select: { codigo: true } },
          stock: { select: { cantidad: true } },
        },
      }),
      await p.reglaCompatibilidad.findMany({
        select: { codigo: true, activa: true, parametros: true },
      }),
    ]);
    const mapa = await this.disponible.disponibles(
      filas.map((f) => ({ productoId: f.id, stockFisico: f.stock?.cantidad ?? 0 })),
    );
    const productos = filas
      .filter((f) => f.categoria.codigo !== 'EQUIPO_ARMADO')
      .map((f) => ({
        id: f.id,
        nombre: f.nombre,
        marca: f.marca,
        categoria: f.categoria.codigo as CategoriaPieza,
        precioCent: aCentimos(f.precio.toFixed(2)),
        atributos: (f.atributos ?? {}) as Record<string, unknown>,
        disponible: mapa.get(f.id) ?? 0,
      }))
      .filter((p) => p.disponible > 0);
    return {
      productos,
      reglas: reglas.map((r) => ({
        codigo: r.codigo as CodigoRegla,
        activa: r.activa,
        parametros: (r.parametros ?? {}) as Record<string, unknown>,
      })),
    };
  }

  async recomendar(
    usuarioId: string,
    consulta: { presupuesto: number; uso: Uso },
    escenario?: string,
  ): Promise<Recomendacion> {
    const presupuestoCent = aCentimos(consulta.presupuesto);
    const presupuesto = aSoles(presupuestoCent);
    const { productos, reglas } = await this.catalogo();

    // 1. Sin solución posible: 422 con el mínimo, sin llamar al modelo ni gastar cupo.
    const barata = masBarata(productos, reglas, consulta.uso);
    if (!barata || totalCent(barata) > presupuestoCent) {
      throw new UnprocessableEntityException({
        codigo: 'PRESUPUESTO_INSUFICIENTE',
        mensaje: barata
          ? `Con el stock actual, una PC completa y compatible cuesta desde S/ ${aSoles(totalCent(barata))}.`
          : 'Ahora no hay stock para armar una PC completa. Vuelve a intentarlo más tarde.',
        detalle: { minimo: barata ? aSoles(totalCent(barata)) : null },
      });
    }

    // 2. Reserva de la consulta (429 si no queda cupo). La latencia se mide desde aquí.
    const usoId = await this.limite.reservar(usuarioId, presupuesto, consulta.uso);
    const inicio = Date.now();
    let resultado: Prisma.InputJsonValue = {};
    let respaldo = true;
    try {
      // 3. IA con un único reintento.
      const candidatos = preseleccionar(productos, presupuestoCent, consulta.uso);
      const { proveedor, simulado } = this.proveedor(reglas);
      const timeoutMs = timeoutIA();
      let elegidos: { items: ItemRecomendado[]; resumen: string } | null = null;
      let motivo: MotivoFallo | 'IA_INVALIDA' | null = null;
      let motivosValidacion: readonly string[] = [];
      let intentos = 0;
      let tokens = { entrada: 0, salida: 0 };
      if (env.IA_HABILITADA !== 'true') {
        motivo = 'IA_DESACTIVADA';
      } else {
        let previa: SolicitudIA['previa'];
        while (intentos < 2) {
          intentos++;
          const r: ResultadoIA = await Promise.race([
            proveedor.recomendar(
              { presupuesto, uso: consulta.uso, candidatos, previa },
              { timeoutMs, escenario: simulado ? escenario : undefined },
            ),
            espera<ResultadoIA>(timeoutMs + MARGEN_TIMEOUT_MS, {
              tipo: 'fallo',
              motivo: 'IA_TIMEOUT',
            }),
          ]);
          if (r.tipo === 'fallo') {
            motivo = r.motivo;
            break;
          }
          if (r.tokens) {
            tokens = {
              entrada: tokens.entrada + r.tokens.entrada,
              salida: tokens.salida + r.tokens.salida,
            };
          }
          const v = validarRecomendacion(r.respuesta, candidatos, presupuestoCent, reglas);
          if (v.ok) {
            elegidos = { items: v.items, resumen: v.resumen };
            motivo = null;
            break;
          }
          motivo = 'IA_INVALIDA';
          motivosValidacion = v.motivos;
          previa = { respuesta: r.respuesta, motivos: v.motivos };
        }
      }

      // 4. Respaldo determinístico: el cliente siempre recibe una configuración válida.
      respaldo = elegidos === null;
      if (!elegidos) {
        const items = armar(productos, presupuestoCent, consulta.uso, reglas)?.items ?? barata;
        elegidos = {
          items,
          resumen: resumenDe(consulta.uso, aSoles(totalCent(items)), presupuesto),
        };
      }

      // 5. Guardado con origen IA (el motor valida otra vez en modo estricto).
      const configuracion = await this.configuraciones.crearDesdeAsistente(
        usuarioId,
        elegidos.items.map((i) => ({ productoId: i.producto.id, cantidad: i.cantidad })),
        { presupuesto, uso: consulta.uso },
      );
      const explicaciones = Object.fromEntries(
        elegidos.items.map((i) => [i.producto.id, i.explicacion]),
      );
      resultado = {
        configuracionId: configuracion.id,
        explicaciones,
        resumen: elegidos.resumen,
        intentos,
        motivo,
        motivosValidacion: [...motivosValidacion],
        tokens,
      };
      const { usadas, limite } = await this.limite.estado(usuarioId);
      return {
        configuracion,
        explicaciones,
        resumen: elegidos.resumen,
        respaldo,
        consultas: { usadas, limite },
      };
    } catch (error) {
      resultado = { ...(resultado as object), error: String(error) };
      throw error;
    } finally {
      // 6. Registro de la consulta, también si algo falló después de llamar al modelo.
      await conPrisma((p) =>
        p.usoAsistente.update({
          where: { id: usoId },
          data: { latenciaMs: Date.now() - inicio, usoRespaldo: respaldo, resultado },
        }),
      ).catch((e: unknown) =>
        console.error(
          JSON.stringify({ nivel: 'error', mensaje: 'no se registró el uso', error: String(e) }),
        ),
      );
    }
  }
}
