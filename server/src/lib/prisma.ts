/**
 * Single shared Prisma client. Import `prisma` everywhere instead of creating
 * new clients (each one opens its own connection pool).
 */
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

export const prisma = new PrismaClient({
  log: env.isProd ? ['warn', 'error'] : ['warn', 'error'],
});
