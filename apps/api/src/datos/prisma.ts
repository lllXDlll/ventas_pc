// Acceso a Postgres (Neon) por Hyperdrive con Prisma y adapter-pg (design.md D4).
//
// Un solo PrismaClient por isolate y una conexión `pg` por petición:
// - Workers no permite usar desde una petición la E/S (sockets) abierta en otra, así
//   que cada petición necesita su propia conexión. Hyperdrive mantiene el pool hacia Neon.
// - Crear un PrismaClient por petición resultó caro (perfil de la prueba 1): deserializa
//   el esquema de parametrización, construye un QueryCompiler nuevo y empieza con la
//   caché de planes vacía.
// El cliente global usa un adaptador que delega cada operación en la conexión de la
// petición en curso, guardada en AsyncLocalStorage: una por petición HTTP (enPeticion(),
// desde worker.ts) o una por llamada a conPrisma() fuera de una petición.
import { AsyncLocalStorage } from 'node:async_hooks';
import { env } from 'cloudflare:workers';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

export type Prisma = PrismaClient;

type AdaptadorPg = Awaited<ReturnType<PrismaPg['connect']>>;
type Consulta = Parameters<AdaptadorPg['queryRaw']>[0];
type NivelAislamiento = Parameters<AdaptadorPg['startTransaction']>[0];

interface ConexionDePeticion {
  cadena: string;
  adaptador?: Promise<AdaptadorPg>;
}

const contexto = new AsyncLocalStorage<ConexionDePeticion>();

function conexionActual(): Promise<AdaptadorPg> {
  const conexion = contexto.getStore();
  if (!conexion) {
    throw new Error('Prisma se usó fuera de conPrisma(): no hay una conexión de petición activa');
  }
  // Perezosa: una petición que no consulta Postgres no abre conexión.
  conexion.adaptador ??= new PrismaPg({ connectionString: conexion.cadena, max: 1 }).connect();
  return conexion.adaptador;
}

/** Adaptador que Prisma conserva entre peticiones; no guarda ninguna E/S propia. */
class AdaptadorPorPeticion {
  readonly provider = 'postgres' as const;
  readonly adapterName = '@prisma/adapter-pg';

  async queryRaw(consulta: Consulta) {
    return (await conexionActual()).queryRaw(consulta);
  }

  async executeRaw(consulta: Consulta) {
    return (await conexionActual()).executeRaw(consulta);
  }

  async executeScript(script: string) {
    return (await conexionActual()).executeScript(script);
  }

  async startTransaction(nivel?: NivelAislamiento) {
    return (await conexionActual()).startTransaction(nivel);
  }

  // Igual que PrismaPg sin `schema`: Prisma lo lee al construir el QueryCompiler.
  getConnectionInfo() {
    return { schemaName: undefined, supportsRelationJoins: true };
  }

  // Las conexiones se cierran al terminar cada conPrisma(), no aquí.
  async dispose() {}
}

const fabrica = {
  provider: 'postgres' as const,
  adapterName: '@prisma/adapter-pg',
  connect: async () => new AdaptadorPorPeticion(),
};

let cliente: PrismaClient | undefined;

function prismaDelIsolate(): PrismaClient {
  cliente ??= new PrismaClient({ adapter: fabrica as unknown as PrismaPg });
  return cliente;
}

/**
 * Prepara el cliente del isolate sin abrir conexiones: instancia el compilador de
 * consultas en WASM y deserializa el esquema. Pensado para el ámbito global del
 * módulo (worker.ts), donde esa CPU cuenta como arranque y no como CPU de la petición.
 * `$connect()` solo llama a `fabrica.connect()`, que no hace E/S.
 */
export async function precalentarPrisma(): Promise<void> {
  await prismaDelIsolate().$connect();
}

async function cerrar(conexion: ConexionDePeticion): Promise<void> {
  if (!conexion.adaptador) return;
  const adaptador = conexion.adaptador;
  conexion.adaptador = undefined;
  await adaptador.then(
    (a) => a.dispose(),
    () => undefined, // si la conexión no llegó a abrirse, no hay nada que cerrar
  );
}

/**
 * Ejecuta `fn` (el manejo de una petición HTTP) con una conexión compartida por todas
 * las llamadas a `conPrisma()` que haga (design.md D1 del Sprint 1: cada conexión nueva
 * cuesta ~4 ms de CPU por la autenticación SCRAM). La conexión se abre con la primera
 * consulta y se cierra al terminar `fn`; si se pasa `alTerminar`, el cierre se le
 * entrega (por ejemplo `ctx.waitUntil`) para no retrasar la respuesta.
 *
 * Dentro de una petición las consultas comparten la conexión: no lanzar consultas en
 * paralelo dentro de una transacción interactiva (fuera de ella, `pg` las encola).
 */
export function enPeticion<T>(
  fn: () => Promise<T>,
  alTerminar?: (cierre: Promise<void>) => void,
  cadena: string = env.HYPERDRIVE.connectionString,
): Promise<T> {
  const conexion: ConexionDePeticion = { cadena };
  return contexto.run(conexion, async () => {
    try {
      return await fn();
    } finally {
      const cierre = cerrar(conexion);
      if (alTerminar) alTerminar(cierre);
      else await cierre;
    }
  });
}

/**
 * Ejecuta `fn` con el cliente del isolate. Dentro de `enPeticion()` reutiliza la conexión
 * de la petición; fuera (cron, scripts, pruebas) abre una propia y la cierra al terminar.
 * Llamadas concurrentes de peticiones distintas nunca comparten conexión.
 */
export function conPrisma<T>(
  fn: (prisma: PrismaClient) => Promise<T>,
  cadena?: string,
): Promise<T> {
  if (contexto.getStore() && cadena === undefined) return fn(prismaDelIsolate());
  return enPeticion(() => fn(prismaDelIsolate()), undefined, cadena);
}

/** Adaptador fijo sobre la conexión de una petición, para un cliente de un solo uso. */
class AdaptadorFijo {
  readonly provider = 'postgres' as const;
  readonly adapterName = '@prisma/adapter-pg';
  constructor(private readonly base: AdaptadorPg) {}
  queryRaw(consulta: Consulta) {
    return this.base.queryRaw(consulta);
  }
  executeRaw(consulta: Consulta) {
    return this.base.executeRaw(consulta);
  }
  executeScript(script: string) {
    return this.base.executeScript(script);
  }
  startTransaction(nivel?: NivelAislamiento) {
    return this.base.startTransaction(nivel);
  }
  getConnectionInfo() {
    return { schemaName: undefined, supportsRelationJoins: true };
  }
  // La conexión es de la petición: la cierra enPeticion(), no este cliente.
  async dispose() {}
}

export type Transaccion = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * Transacción interactiva con un PrismaClient propio de la llamada (Sprint 4).
 *
 * Prisma agrupa las consultas de una transacción interactiva (`batchBy: itx-<id>`) y las
 * despacha en un `process.nextTick` compartido por todo el cliente: con el cliente del
 * isolate, la transacción de una petición podía ejecutarse en el contexto de otra que
 * encoló primero, y al terminar esa otra workerd dejaba colgada la E/S de la primera
 * (confirmaciones simultáneas de clientes distintos). Un cliente por transacción solo
 * despacha consultas de esta petición; cuesta construir su compilador de consultas, lo
 * que se acepta porque solo la confirmación de la compra lo usa.
 */
export function conTransaccion<T>(fn: (tx: Transaccion) => Promise<T>): Promise<T> {
  const ejecutar = async () => {
    const base = await conexionActual();
    const fabricaFija = {
      provider: 'postgres' as const,
      adapterName: '@prisma/adapter-pg',
      connect: async () => new AdaptadorFijo(base),
    };
    const propio = new PrismaClient({ adapter: fabricaFija as unknown as PrismaPg });
    return propio.$transaction(fn);
  };
  return contexto.getStore() ? ejecutar() : enPeticion(ejecutar);
}

/** Solo para pruebas: si hay una conexión de petición activa y si ya se abrió. */
export function estadoConexion(): { activa: boolean; abierta: boolean } {
  const conexion = contexto.getStore();
  return { activa: conexion !== undefined, abierta: conexion?.adaptador !== undefined };
}
