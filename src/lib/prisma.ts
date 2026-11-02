import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const rawUrl = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;

// On Vercel / serverless production, localhost is unreachable.
const isLocalhostInProd =
  process.env.NODE_ENV === 'production' &&
  Boolean(rawUrl && (rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1')));

const runtimeDatabaseUrl = isLocalhostInProd ? undefined : rawUrl;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Vercel's Postgres integrations expose a pooled URL for serverless
    // requests and keep DATABASE_URL available for schema migrations.
    ...(runtimeDatabaseUrl ? { datasources: { db: { url: runtimeDatabaseUrl } } } : {}),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

globalForPrisma.prisma = prisma;

export default prisma;
