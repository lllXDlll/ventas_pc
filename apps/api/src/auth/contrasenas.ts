// Hash de contraseñas (spec autenticacion, design.md D2 del Sprint 1; prueba 5 del Sprint 0).
// PBKDF2-SHA256 con Web Crypto, 50.000 iteraciones (~6,5 ms de CPU en Workers; el runtime
// no admite más de 100.000). Formato: pbkdf2$<iteraciones>$<sal base64url>$<hash base64url>.
// La verificación lee las iteraciones del propio valor, así se pueden cambiar más adelante.

export const ITERACIONES = 50_000;
const BYTES_SAL = 16;
const BITS_HASH = 256;
const MAX_ITERACIONES = 100_000;

const codificador = new TextEncoder();

function aBase64Url(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(texto: string): Uint8Array {
  const base64 = texto.replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

async function derivar(
  contrasena: string,
  sal: Uint8Array,
  iteraciones: number,
): Promise<Uint8Array> {
  const clave = await crypto.subtle.importKey(
    'raw',
    codificador.encode(contrasena),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones },
    clave,
    BITS_HASH,
  );
  return new Uint8Array(bits);
}

/** Comparación en tiempo constante (Workers trae timingSafeEqual; Node no). */
function igualesEnTiempoConstante(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (x: ArrayBufferView, y: ArrayBufferView) => boolean;
  };
  if (typeof subtle.timingSafeEqual === 'function') return subtle.timingSafeEqual(a, b);
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diferencia === 0;
}

/** Hash con sal aleatoria propia, en el formato guardado en `usuarios.hash_contrasena`. */
export async function hashContrasena(
  contrasena: string,
  iteraciones: number = ITERACIONES,
): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(BYTES_SAL));
  const hash = await derivar(contrasena, sal, iteraciones);
  return `pbkdf2$${iteraciones}$${aBase64Url(sal)}$${aBase64Url(hash)}`;
}

interface HashLeido {
  iteraciones: number;
  sal: Uint8Array;
  hash: Uint8Array;
}

function leer(guardado: string): HashLeido | null {
  const partes = guardado.split('$');
  if (partes.length !== 4 || partes[0] !== 'pbkdf2') return null;
  const iteraciones = Number(partes[1]);
  if (!Number.isInteger(iteraciones) || iteraciones < 1 || iteraciones > MAX_ITERACIONES)
    return null;
  try {
    return { iteraciones, sal: deBase64Url(partes[2] ?? ''), hash: deBase64Url(partes[3] ?? '') };
  } catch {
    return null;
  }
}

/** Verifica una contraseña contra un valor guardado. Un formato inválido nunca coincide. */
export async function verificarContrasena(contrasena: string, guardado: string): Promise<boolean> {
  const leido = leer(guardado);
  if (!leido) return false;
  const calculado = await derivar(contrasena, leido.sal, leido.iteraciones);
  return igualesEnTiempoConstante(calculado, leido.hash);
}

// Hash fijo con los parámetros vigentes: cuando el correo no existe se verifica contra él,
// para que el tiempo de respuesta no revele si la cuenta existe (error genérico).
const HASH_FICTICIO = `pbkdf2$${ITERACIONES}$${aBase64Url(new Uint8Array(BYTES_SAL))}$${aBase64Url(new Uint8Array(BITS_HASH / 8))}`;

/** Gasta el mismo costo que una verificación real y siempre devuelve false. */
export async function verificarContraFicticio(contrasena: string): Promise<false> {
  await verificarContrasena(contrasena, HASH_FICTICIO);
  return false;
}
