import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __localsaathi_prisma__: PrismaClient | undefined;
}

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });
}

export const prisma = globalThis.__localsaathi_prisma__ || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__localsaathi_prisma__ = prisma;
}
