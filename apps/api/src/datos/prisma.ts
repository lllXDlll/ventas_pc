// Acceso a Postgres (Neon) por Hyperdrive con Prisma y adapter-pg (design.md D4).
//
// Un solo PrismaClient por isolate y una conexión `pg` por petición:
// - Workers no permite usar desde una petición la E/S (sockets) abierta en otra, así
//   que cada petición necesita su propia conexión. Hyperdrive mantiene el pool hacia Neon.
// - Crear un PrismaClient por petición resultó caro (perfil de la prueba 1): deserializa
//   el esquema de parametrización, construye un QueryCompiler nuevo y empieza con la
//   caché de planes vacía.
// El cliente global usa un adaptador que delega cada operación en la conexión de la
// petición en curso, que se guarda en AsyncLocalStorage y se cierra al terminar conPrisma().
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
 * Ejecuta `fn` con el cliente del isolate y una conexión propia de esta llamada,
 * que se cierra al terminar. Llamadas concurrentes no comparten conexión.
 */
export function conPrisma<T>(
  fn: (prisma: PrismaClient) => Promise<T>,
  cadena: string = env.HYPERDRIVE.connectionString,
): Promise<T> {
  const conexion: ConexionDePeticion = { cadena };
  return contexto.run(conexion, async () => {
    try {
      return await fn(prismaDelIsolate());
    } finally {
      if (conexion.adaptador) {
        await conexion.adaptador.then(
          (a) => a.dispose(),
          () => undefined, // si la conexión no llegó a abrirse, no hay nada que cerrar
        );
      }
    }
  });
}
