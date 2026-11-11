// Verificación de dependencias para GET /health/ready (spec salud-api).

export type NombreDependencia = 'postgres' | 'almacen';
export type EstadoDependencia = 'ok' | 'falla';

export interface Comprobador {
  nombre: NombreDependencia;
  /** Resuelve si la dependencia responde; rechaza si no. */
  comprobar(): Promise<void>;
}

export interface ResultadoSalud {
  listo: boolean;
  dependencias: Record<NombreDependencia, EstadoDependencia>;
}

export const COMPROBADORES = Symbol('COMPROBADORES');
export const TIEMPO_ESPERA_MS = Symbol('TIEMPO_ESPERA_MS');

function conTiempoLimite(promesa: Promise<void>, ms: number): Promise<void> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error('tiempo de espera agotado')), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador));
}

/**
 * Ejecuta todos los comprobadores en paralelo, cada uno con su tiempo límite.
 * Los detalles del error se registran, pero nunca se devuelven al cliente.
 */
export async function verificarSalud(
  comprobadores: readonly Comprobador[],
  tiempoEsperaMs: number,
): Promise<ResultadoSalud> {
  const resultados = await Promise.all(
    comprobadores.map(async (c) => {
      try {
        await conTiempoLimite(c.comprobar(), tiempoEsperaMs);
        return [c.nombre, 'ok'] as const;
      } catch (error) {
        console.warn(
          JSON.stringify({
            nivel: 'advertencia',
            mensaje: 'dependencia no disponible',
            dependencia: c.nombre,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        return [c.nombre, 'falla'] as const;
      }
    }),
  );
  const dependencias = Object.fromEntries(resultados) as Record<
    NombreDependencia,
    EstadoDependencia
  >;
  return { listo: resultados.every(([, estado]) => estado === 'ok'), dependencias };
}
