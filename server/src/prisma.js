import { PrismaClient } from '@prisma/client';

let prisma;
if (!globalThis.__soundsage_prisma) {
  globalThis.__soundsage_prisma = new PrismaClient();
}
prisma = globalThis.__soundsage_prisma;

export { prisma };
