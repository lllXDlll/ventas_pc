// Proveedor simulado para pruebas y CI (design D9 del Sprint 5): nunca llama a la red. El
// escenario llega por el encabezado x-ia-simulado, que solo se honra con IA_PROVEEDOR=simulado.
import type { ConfigRegla } from '../compatibilidad/motor/orquestador';
import { armar } from './armador-deterministico';
import type { OpcionesIA, ProveedorIA, ResultadoIA, SolicitudIA } from './proveedor';
import { aCentimos } from './tipos';

export const ESCENARIOS = [
  'valida',
  'invalida',
  'invalida-luego-valida',
  'json-invalido',
  'caida',
  'lenta',
] as const;

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ProveedorSimulado implements ProveedorIA {
  constructor(private readonly reglas: () => readonly ConfigRegla[] = () => []) {}

  async recomendar(s: SolicitudIA, { timeoutMs, escenario }: OpcionesIA): Promise<ResultadoIA> {
    const modo = (ESCENARIOS as readonly string[]).includes(escenario ?? '') ? escenario : 'valida';
    if (modo === 'caida') return { tipo: 'fallo', motivo: 'IA_NO_DISPONIBLE', detalle: 'simulado' };
    if (modo === 'lenta') {
      await espera(timeoutMs + 200);
      return { tipo: 'fallo', motivo: 'IA_TIMEOUT', detalle: 'simulado' };
    }
    const valida = this.valida(s);
    if (!valida) return { tipo: 'fallo', motivo: 'IA_NO_DISPONIBLE', detalle: 'sin solución' };
    const invalidar = modo === 'invalida' || (modo === 'invalida-luego-valida' && !s.previa);
    if (invalidar) return { tipo: 'respuesta', respuesta: this.conOtroSocket(s, valida) };
    if (modo === 'json-invalido') {
      const [primero, ...resto] = valida.componentes;
      return {
        tipo: 'respuesta',
        respuesta: { ...valida, componentes: [{ alias: primero!.alias, cantidad: 1 }, ...resto] },
      };
    }
    return { tipo: 'respuesta', respuesta: valida };
  }

  /** Una recomendación válida sobre los candidatos, con explicaciones fijas. */
  private valida(s: SolicitudIA) {
    const r = armar(
      s.candidatos.map((c) => c.producto),
      aCentimos(s.presupuesto),
      s.uso,
      this.reglas(),
    );
    if (!r) return null;
    const alias = new Map(s.candidatos.map((c) => [c.producto.id, c.alias]));
    return {
      componentes: r.items.map((i) => ({
        alias: alias.get(i.producto.id)!,
        cantidad: 1,
        explicacion: `Recomendación simulada: ${i.producto.nombre} encaja con el uso y el presupuesto.`,
      })),
      resumen: 'Recomendación del proveedor simulado.',
    };
  }

  /** Cambia la placa por una de otro socket (o por un alias inexistente si no hay). */
  private conOtroSocket(
    s: SolicitudIA,
    valida: NonNullable<ReturnType<ProveedorSimulado['valida']>>,
  ) {
    const porAlias = new Map(s.candidatos.map((c) => [c.alias, c.producto]));
    const cpu = valida.componentes
      .map((c) => porAlias.get(c.alias)!)
      .find((p) => p.categoria === 'PROCESADOR')!;
    const otra = s.candidatos.find(
      (c) =>
        c.producto.categoria === 'PLACA_MADRE' &&
        c.producto.atributos.socket !== cpu.atributos.socket,
    );
    return {
      ...valida,
      componentes: valida.componentes.map((c) =>
        porAlias.get(c.alias)!.categoria === 'PLACA_MADRE'
          ? { ...c, alias: otra?.alias ?? 'C999' }
          : c,
      ),
    };
  }
}
