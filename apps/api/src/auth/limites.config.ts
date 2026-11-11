// Configuración de los límites de peticiones (spec limite-peticiones, design.md D13 del
// Sprint 1). Valores por defecto de la sección 7 de la parte técnica; cada uno se puede
// cambiar con una variable de entorno. Un valor inválido se ignora con una advertencia
// (la API sigue funcionando con el valor por defecto).

export interface Limite {
  max: number;
  ventanaMs: number;
}

export interface ConfigLimites {
  registro: Limite;
  loginCorreo: Limite;
  loginIp: Limite;
}

export const POR_DEFECTO = {
  LIMITE_REGISTRO_MAX: 5,
  LIMITE_REGISTRO_VENTANA_MIN: 60,
  LIMITE_LOGIN_CORREO_MAX: 5,
  LIMITE_LOGIN_IP_MAX: 50,
  LIMITE_LOGIN_VENTANA_MIN: 15,
} as const;

type Variable = keyof typeof POR_DEFECTO;

function entero(
  entorno: Partial<Record<string, unknown>>,
  nombre: Variable,
  advertir: (mensaje: string) => void,
): number {
  const crudo = entorno[nombre];
  if (crudo === undefined || crudo === '') return POR_DEFECTO[nombre];
  const valor = Number(crudo);
  if (!Number.isInteger(valor) || valor < 1) {
    advertir(
      `${nombre}="${String(crudo)}" no es un entero positivo; se usa ${POR_DEFECTO[nombre]}`,
    );
    return POR_DEFECTO[nombre];
  }
  return valor;
}

const MINUTO = 60_000;

export function leerConfigLimites(
  entorno: Partial<Record<string, unknown>>,
  advertir: (mensaje: string) => void = (m) =>
    console.warn(JSON.stringify({ nivel: 'advertencia', mensaje: m })),
): ConfigLimites {
  const ventanaLogin = entero(entorno, 'LIMITE_LOGIN_VENTANA_MIN', advertir) * MINUTO;
  return {
    registro: {
      max: entero(entorno, 'LIMITE_REGISTRO_MAX', advertir),
      ventanaMs: entero(entorno, 'LIMITE_REGISTRO_VENTANA_MIN', advertir) * MINUTO,
    },
    loginCorreo: {
      max: entero(entorno, 'LIMITE_LOGIN_CORREO_MAX', advertir),
      ventanaMs: ventanaLogin,
    },
    loginIp: { max: entero(entorno, 'LIMITE_LOGIN_IP_MAX', advertir), ventanaMs: ventanaLogin },
  };
}
