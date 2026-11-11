// Clave de límite de peticiones a partir de la IP del cliente (spec limite-peticiones,
// design.md D6 del Sprint 1). Solo se usa CF-Connecting-IP: nunca req.ip, el socket ni
// X-Forwarded-For. IPv6 se agrupa por prefijo /64 (una red doméstica u operador asigna
// un /64 entero a un cliente); IPv4 se usa completa.

/** Clave compartida cuando falta el encabezado (solo pasa fuera de Cloudflare). */
export const CLAVE_SIN_IP = 'sin-ip';

/** Lee CF-Connecting-IP de las cabeceras de la petición (insensible a mayúsculas). */
export function ipDelCliente(
  cabeceras: Record<string, string | string[] | undefined>,
): string | undefined {
  const valor = cabeceras['cf-connecting-ip'];
  const ip = Array.isArray(valor) ? valor[0] : valor;
  return ip?.trim() || undefined;
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function esIpv4(texto: string): boolean {
  const m = IPV4.exec(texto);
  return m !== null && m.slice(1).every((parte) => Number(parte) <= 255);
}

/** Expande una IPv6 a sus 8 grupos de 16 bits, o devuelve null si no es válida. */
function gruposIpv6(texto: string): number[] | null {
  let ip = texto.toLowerCase();
  const zona = ip.indexOf('%');
  if (zona >= 0) ip = ip.slice(0, zona);

  // Una IPv4 incrustada al final (por ejemplo ::ffff:1.2.3.4) equivale a dos grupos.
  const ultimoDosPuntos = ip.lastIndexOf(':');
  const posibleV4 = ip.slice(ultimoDosPuntos + 1);
  if (posibleV4.includes('.')) {
    if (!esIpv4(posibleV4)) return null;
    const [a, b, c, d] = posibleV4.split('.').map(Number) as [number, number, number, number];
    ip = `${ip.slice(0, ultimoDosPuntos + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const partes = ip.split('::');
  if (partes.length > 2) return null;
  const leer = (s: string): number[] | null => {
    if (s === '') return [];
    const grupos = s.split(':');
    if (grupos.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
    return grupos.map((g) => parseInt(g, 16));
  };
  const izquierda = leer(partes[0] ?? '');
  const derecha = partes.length === 2 ? leer(partes[1] ?? '') : [];
  if (!izquierda || !derecha) return null;

  const total = izquierda.length + derecha.length;
  if (partes.length === 1) return total === 8 ? izquierda : null;
  if (total > 7) return null;
  return [...izquierda, ...Array<number>(8 - total).fill(0), ...derecha];
}

/**
 * Clave del cliente para los contadores: la IPv4 completa, el prefijo /64 de una IPv6
 * (una IPv4 mapeada `::ffff:a.b.c.d` se trata como IPv4) o CLAVE_SIN_IP si no hay IP.
 */
export function clavePorIp(ip: string | undefined): string {
  const texto = ip?.trim();
  if (!texto) return CLAVE_SIN_IP;
  if (esIpv4(texto)) return texto;

  const grupos = gruposIpv6(texto);
  if (!grupos) return `otra:${texto.toLowerCase()}`;

  const esMapeadaV4 = grupos.slice(0, 5).every((g) => g === 0) && grupos[5] === 0xffff;
  if (esMapeadaV4) {
    const [alto = 0, bajo = 0] = grupos.slice(6);
    return [alto >> 8, alto & 0xff, bajo >> 8, bajo & 0xff].join('.');
  }
  return (
    grupos
      .slice(0, 4)
      .map((g) => g.toString(16))
      .join(':') + '::/64'
  );
}
