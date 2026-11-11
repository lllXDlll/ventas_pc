// Acceso a Postgres (Neon) por Hyperdrive con Prisma y adapter-pg (design.md D4).
// Se crea un cliente por petición: Workers no permite compartir objetos de E/S
// entre peticiones, y Hyperdrive ya mantiene el pool de conexiones hacia Neon.
import { env } from 'cloudflare:workers';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

export type Prisma = PrismaClient;

export function crearPrisma(cadena: string = env.HYPERDRIVE.connectionString): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: cadena, max: 1 }) });
}

/** Ejecuta `fn` con un cliente nuevo y lo cierra al terminar. */
export async function conPrisma<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const prisma = crearPrisma();
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
