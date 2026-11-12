// Semillas idempotentes (spec catalogo y autorizacion-roles, design.md D11 del Sprint 1).
// Se ejecutan con Node 24 (TypeScript directo) y `pg` sobre DIRECT_URL; por defecto, el
// Postgres de docker-compose. El cliente de Prisma generado es para workerd y no carga en Node.
//
//   node scripts/semillas.ts categorias        # también la ejecuta el job "desplegar"
//   node scripts/semillas.ts catalogo          # catálogo de ejemplo (local y demo)
//   ADMIN_CORREO=… ADMIN_CONTRASENA=… node scripts/semillas.ts admin
//
// ADMIN_CORREO y ADMIN_CONTRASENA se pasan en el momento; nunca se versionan.
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { hashContrasena } from '../src/auth/contrasenas.ts';
import { CODIGOS_REGLA, PARAMETROS_POR_DEFECTO } from '../src/compatibilidad/motor/parametros.ts';
import {
  CATEGORIAS,
  type CodigoCategoria,
  NOMBRES_CATEGORIA,
  tipoDeCategoria,
  validarAtributos,
} from '../src/catalogo/atributos.ts';

export const URL_LOCAL = 'postgresql://xdtech:xdtech@localhost:5432/xdtech';

type Cliente = Pick<pg.Client, 'query'>;

export async function semillaCategorias(cliente: Cliente): Promise<number> {
  for (const codigo of CATEGORIAS) {
    await cliente.query(
      `INSERT INTO categorias (id, codigo, nombre) VALUES ($1, $2, $3)
       ON CONFLICT (codigo) DO UPDATE SET nombre = excluded.nombre`,
      [randomUUID(), codigo, NOMBRES_CATEGORIA[codigo]],
    );
  }
  return CATEGORIAS.length;
}

/**
 * Las seis reglas del motor con sus parámetros por defecto (design D7 del Sprint 2).
 * DO NOTHING: no pisa los parámetros que se hayan ajustado en la base.
 */
export async function semillaReglas(cliente: Cliente): Promise<number> {
  for (const codigo of CODIGOS_REGLA) {
    await cliente.query(
      `INSERT INTO reglas_compatibilidad (id, codigo, parametros) VALUES ($1, $2::codigo_regla, $3::jsonb)
       ON CONFLICT (codigo) DO NOTHING`,
      [randomUUID(), codigo, JSON.stringify(PARAMETROS_POR_DEFECTO[codigo])],
    );
  }
  return CODIGOS_REGLA.length;
}

export interface ProductoSemilla {
  id: string;
  nombre: string;
  marca: string;
  categoria: CodigoCategoria;
  precio: string;
  stock: number;
  atributos: Record<string, unknown>;
}

/** UUID fijo por producto: volver a ejecutar la semilla no duplica nada. */
const id = (n: number) => `0195a000-0000-7000-8000-${String(n).padStart(12, '0')}`;

export const CATALOGO_EJEMPLO: readonly ProductoSemilla[] = [
  // Procesadores: dos sockets.
  {
    id: id(1),
    nombre: 'AMD Ryzen 5 7600',
    marca: 'AMD',
    categoria: 'PROCESADOR',
    precio: '829.00',
    stock: 12,
    // Disipador de serie (Wraith Stealth): alto opcional para la regla DIMENSIONES.
    atributos: { socket: 'AM5', potenciaConsumidaW: 65, altoDisipadorMm: 54 },
  },
  {
    id: id(2),
    nombre: 'AMD Ryzen 7 7800X3D',
    marca: 'AMD',
    categoria: 'PROCESADOR',
    precio: '1749.00',
    stock: 5,
    atributos: { socket: 'AM5', potenciaConsumidaW: 120 },
  },
  {
    id: id(3),
    nombre: 'Intel Core i5-14400F',
    marca: 'Intel',
    categoria: 'PROCESADOR',
    precio: '749.00',
    stock: 15,
    atributos: { socket: 'LGA1700', potenciaConsumidaW: 65 },
  },
  {
    id: id(4),
    nombre: 'Intel Core i7-14700K',
    marca: 'Intel',
    categoria: 'PROCESADOR',
    precio: '1599.00',
    stock: 0,
    atributos: { socket: 'LGA1700', potenciaConsumidaW: 125 },
  },
  // Placas madre.
  {
    id: id(10),
    nombre: 'MSI B650 Gaming Plus WiFi',
    marca: 'MSI',
    categoria: 'PLACA_MADRE',
    precio: '799.00',
    stock: 8,
    atributos: {
      socket: 'AM5',
      tipoRam: 'DDR5',
      velocidadRamMaxMhz: 6400,
      maxModulosRam: 4,
      factorForma: 'ATX',
      interfacesAlmacenamiento: ['M.2', 'SATA'],
    },
  },
  {
    id: id(11),
    nombre: 'ASUS Prime B760M-A D4',
    marca: 'ASUS',
    categoria: 'PLACA_MADRE',
    precio: '519.00',
    stock: 10,
    atributos: {
      socket: 'LGA1700',
      tipoRam: 'DDR4',
      velocidadRamMaxMhz: 3200,
      maxModulosRam: 4,
      factorForma: 'mATX',
      interfacesAlmacenamiento: ['M.2', 'SATA'],
    },
  },
  {
    id: id(12),
    nombre: 'Gigabyte Z790 Aorus Elite AX',
    marca: 'Gigabyte',
    categoria: 'PLACA_MADRE',
    precio: '1149.00',
    stock: 4,
    atributos: {
      socket: 'LGA1700',
      tipoRam: 'DDR5',
      velocidadRamMaxMhz: 7600,
      maxModulosRam: 4,
      factorForma: 'ATX',
      interfacesAlmacenamiento: ['M.2', 'SATA'],
    },
  },
  // Memoria: dos tipos.
  {
    id: id(20),
    nombre: 'Kingston Fury Beast 32 GB (2x16) DDR5-6000',
    marca: 'Kingston',
    categoria: 'RAM',
    precio: '429.00',
    stock: 20,
    atributos: { tipoRam: 'DDR5', velocidadRam: 6000, modulos: 2 },
  },
  {
    id: id(21),
    nombre: 'Corsair Vengeance LPX 16 GB (2x8) DDR4-3200',
    marca: 'Corsair',
    categoria: 'RAM',
    precio: '179.00',
    stock: 25,
    atributos: { tipoRam: 'DDR4', velocidadRam: 3200, modulos: 2 },
  },
  // Tarjetas gráficas.
  {
    id: id(30),
    nombre: 'NVIDIA GeForce RTX 4060 8 GB',
    marca: 'NVIDIA',
    categoria: 'TARJETA_GRAFICA',
    precio: '1299.00',
    stock: 6,
    atributos: { potenciaConsumidaW: 115, largoMm: 240 },
  },
  {
    id: id(31),
    nombre: 'AMD Radeon RX 7800 XT 16 GB',
    marca: 'AMD',
    categoria: 'TARJETA_GRAFICA',
    precio: '2199.00',
    stock: 3,
    atributos: { potenciaConsumidaW: 263, largoMm: 320 },
  },
  // Fuentes: distinta potencia.
  {
    id: id(40),
    nombre: 'EVGA 550 BR 550 W',
    marca: 'EVGA',
    categoria: 'FUENTE',
    precio: '199.00',
    stock: 9,
    atributos: { potenciaEntregadaW: 550 },
  },
  {
    id: id(41),
    nombre: 'Corsair RM750e 750 W',
    marca: 'Corsair',
    categoria: 'FUENTE',
    precio: '429.00',
    stock: 7,
    atributos: { potenciaEntregadaW: 750 },
  },
  {
    id: id(42),
    nombre: 'Seasonic Focus GX-1000 1000 W',
    marca: 'Seasonic',
    categoria: 'FUENTE',
    precio: '729.00',
    stock: 2,
    atributos: { potenciaEntregadaW: 1000 },
  },
  // Gabinetes: distinto factor de forma.
  {
    id: id(50),
    nombre: 'Lian Li Lancool 216 (ATX)',
    marca: 'Lian Li',
    categoria: 'GABINETE',
    precio: '389.00',
    stock: 5,
    atributos: {
      factoresFormaSoportados: ['ATX', 'mATX', 'ITX'],
      largoGpuMaxMm: 392,
      altoDisipadorMaxMm: 180,
    },
  },
  {
    id: id(51),
    nombre: 'Cooler Master Q300L (mATX)',
    marca: 'Cooler Master',
    categoria: 'GABINETE',
    precio: '179.00',
    stock: 11,
    atributos: {
      factoresFormaSoportados: ['mATX', 'ITX'],
      largoGpuMaxMm: 360,
      altoDisipadorMaxMm: 157,
    },
  },
  // Almacenamiento.
  {
    id: id(60),
    nombre: 'Samsung 990 EVO 1 TB NVMe',
    marca: 'Samsung',
    categoria: 'ALMACENAMIENTO',
    precio: '339.00',
    stock: 18,
    atributos: { interfaz: 'M.2' },
  },
  {
    id: id(61),
    nombre: 'Crucial MX500 1 TB SATA',
    marca: 'Crucial',
    categoria: 'ALMACENAMIENTO',
    precio: '249.00',
    stock: 14,
    atributos: { interfaz: 'SATA' },
  },
  // Equipo armado: producto propio con su stock.
  {
    id: id(70),
    nombre: 'PC Gamer AM5: Ryzen 5 7600 + RTX 4060',
    marca: 'XDTech',
    categoria: 'EQUIPO_ARMADO',
    precio: '4299.00',
    stock: 3,
    atributos: {
      descripcion: 'Ryzen 5 7600, B650, 32 GB DDR5, RTX 4060, 1 TB NVMe, 750 W, gabinete ATX',
    },
  },
];

export async function semillaCatalogo(cliente: Cliente): Promise<number> {
  for (const p of CATALOGO_EJEMPLO) {
    const error = validarAtributos(p.categoria, p.atributos);
    if (error) throw new Error(`semilla inválida (${p.nombre}): ${error}`);
    await cliente.query(
      // Si el producto ya existe, solo se completan la marca y los atributos que falten
      // (Sprints 1.5 y 2): en JSONB `a || b` gana b, así que lo ya guardado no se pisa.
      `INSERT INTO productos (id, nombre, marca, categoria_id, tipo, precio, atributos, actualizado_en)
       SELECT $1, $2, $7, c.id, $4::tipo_producto, $5, $6::jsonb, now()
         FROM categorias c WHERE c.codigo = $3
       ON CONFLICT (id) DO UPDATE SET
         marca = COALESCE(productos.marca, excluded.marca),
         atributos = excluded.atributos || productos.atributos`,
      [
        p.id,
        p.nombre,
        p.categoria,
        tipoDeCategoria(p.categoria),
        p.precio,
        JSON.stringify(p.atributos),
        p.marca,
      ],
    );
    await cliente.query(
      `INSERT INTO stock (id, producto_id, cantidad) VALUES ($1, $2, $3)
       ON CONFLICT (producto_id) DO NOTHING`,
      [randomUUID(), p.id, p.stock],
    );
  }
  return CATALOGO_EJEMPLO.length;
}

/** Crea el administrador o, si el correo ya existe, lo deja como ADMIN ACTIVO con esa contraseña. */
export async function semillaAdmin(
  cliente: Cliente,
  correo: string,
  contrasena: string,
): Promise<void> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))
    throw new Error('ADMIN_CORREO no es un correo válido');
  if (contrasena.length < 12) throw new Error('ADMIN_CONTRASENA debe tener al menos 12 caracteres');
  await cliente.query(
    `INSERT INTO usuarios (id, correo, hash_contrasena, rol, estado, actualizado_en)
     VALUES ($1, $2, $3, 'ADMIN', 'ACTIVO', now())
     ON CONFLICT (correo) DO UPDATE
       SET hash_contrasena = excluded.hash_contrasena, rol = 'ADMIN', estado = 'ACTIVO',
           actualizado_en = now()`,
    [randomUUID(), correo, await hashContrasena(contrasena)],
  );
}

/** Todo lo que necesitan las pruebas e2e, con su propio cliente (`pg` vive en apps/api). */
export async function prepararBaseDePruebas(
  cadena: string,
  admin: { correo: string; contrasena: string },
): Promise<void> {
  const cliente = new pg.Client({ connectionString: cadena });
  await cliente.connect();
  try {
    await semillaCategorias(cliente);
    await semillaReglas(cliente);
    await semillaCatalogo(cliente);
    // Las compras e2e (Sprint 4) descuentan el stock físico del catálogo de ejemplo: cada
    // corrida empieza con el stock de la semilla. Solo en la base de pruebas, nunca en Neon.
    for (const p of CATALOGO_EJEMPLO) {
      await cliente.query('UPDATE stock SET cantidad = $2 WHERE producto_id = $1', [p.id, p.stock]);
    }
    await semillaAdmin(cliente, admin.correo, admin.contrasena);
  } finally {
    await cliente.end();
  }
}

/** Valida la cadena y devuelve el destino sin la contraseña, para los mensajes. */
export function destinoDe(cadena: string): string {
  let url: URL;
  try {
    url = new URL(cadena.trim());
  } catch {
    throw new Error(
      'DIRECT_URL no es una URL completa. Debe empezar con postgresql:// (cópiala de Neon sin "psql" ni comillas).',
    );
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(`DIRECT_URL debe empezar con postgresql:// (empieza con ${url.protocol}//).`);
  }
  if (url.hostname.includes('-pooler')) {
    throw new Error('DIRECT_URL apunta al pooler de Neon; usa la cadena directa (sin "-pooler").');
  }
  return `${url.username || '?'}@${url.hostname}${url.port ? ':' + url.port : ''}${url.pathname}`;
}

async function principal(): Promise<void> {
  const parte = process.argv[2];
  const definida = (process.env.DIRECT_URL ?? '').trim();
  if (!definida) {
    console.warn('AVISO: DIRECT_URL no está definida; se usa el Postgres LOCAL de docker-compose.');
  }
  const cadena = definida || URL_LOCAL;
  const destino = destinoDe(cadena);
  console.log(`base de datos: ${destino}`);
  const cliente = new pg.Client({ connectionString: cadena });
  try {
    await cliente.connect();
  } catch (error) {
    throw new Error(
      `no se pudo conectar a ${destino}: ${error instanceof Error ? error.message : error}`,
      { cause: error },
    );
  }
  try {
    if (parte === 'categorias') {
      // En el despliegue: categorías y reglas del motor (Sprint 2).
      console.log(`categorías: ${await semillaCategorias(cliente)}`);
      console.log(`reglas de compatibilidad: ${await semillaReglas(cliente)}`);
    } else if (parte === 'catalogo') {
      await semillaCategorias(cliente);
      console.log(`productos de ejemplo: ${await semillaCatalogo(cliente)}`);
    } else if (parte === 'admin') {
      const correo = process.env.ADMIN_CORREO ?? '';
      await semillaAdmin(cliente, correo, process.env.ADMIN_CONTRASENA ?? '');
      console.log(`administrador listo: ${correo}`);
    } else {
      throw new Error('uso: node scripts/semillas.ts categorias|catalogo|admin');
    }
  } finally {
    await cliente.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
