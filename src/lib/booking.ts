import "server-only";
import { db } from "./db";

export class BookingError extends Error {}

/** 予約作成。スロット行をロックして定員超過・二重予約を防ぐ */
export async function book(slotId: string, memberId: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Slot" WHERE id = ${slotId} FOR UPDATE`;
    const slot = await tx.slot.findUnique({ where: { id: slotId } });
    if (!slot) throw new BookingError("枠が見つかりません");
    if (slot.status !== "OPEN") throw new BookingError("この枠は中止されています");
    const member = await tx.member.findUnique({ where: { id: memberId } });
    if (!member) throw new BookingError("会員が見つかりません");
    if (member.status !== "ACTIVE") throw new BookingError("有効な会員ではありません（休会・退会中）");
    const dup = await tx.reservation.findFirst({ where: { slotId, memberId, status: { in: ["RESERVED", "ATTENDED"] } } });
    if (dup) throw new BookingError("この会員は既に予約済みです");
    const count = await tx.reservation.count({ where: { slotId, status: { in: ["RESERVED", "ATTENDED"] } } });
    if (count >= slot.capacity) throw new BookingError("定員に達しています");
    return tx.reservation.create({ data: { slotId, memberId } });
  });
}

/** 予約キャンセル */
export async function cancelReservation(id: string) {
  const r = await db.reservation.findUnique({ where: { id } });
  if (!r || r.status === "CANCELED") throw new BookingError("キャンセルできる予約がありません");
  await db.reservation.update({ where: { id }, data: { status: "CANCELED", canceledAt: new Date() } });
}
