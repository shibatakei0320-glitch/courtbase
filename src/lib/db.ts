import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = db;

/** 施設の予約・入退場（QR）機能を使うか */
export async function facilityModeOn() {
  const s = await db.setting.findUnique({ where: { id: 1 }, select: { facilityMode: true } });
  return s?.facilityMode ?? false;
}
