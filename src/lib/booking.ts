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
    const member = await tx.member.findUnique({ where: { id: memberId }, include: { plan: true } });
    if (!member) throw new BookingError("会員が見つかりません");
    if (member.status !== "ACTIVE") throw new BookingError("有効な会員ではありません（休会・退会中）");
    const dup = await tx.reservation.findFirst({ where: { slotId, memberId, status: { in: ["RESERVED", "ATTENDED"] } } });
    if (dup) throw new BookingError("この会員は既に予約済みです");
    const count = await tx.reservation.count({ where: { slotId, status: { in: ["RESERVED", "ATTENDED"] } } });
    if (count >= slot.capacity) throw new BookingError("定員に達しています");
    // 月額会員はチケット消費なし。それ以外は消費チケットを差し引く
    const useTickets = member.plan?.kind === "MONTHLY" ? 0 : slot.ticketCost;
    if (useTickets > member.tickets) throw new BookingError(`チケットが不足しています（必要 ${useTickets} / 残 ${member.tickets}）`);
    if (useTickets > 0) await tx.member.update({ where: { id: memberId }, data: { tickets: { decrement: useTickets } } });
    return tx.reservation.create({ data: { slotId, memberId, ticketsUsed: useTickets } });
  });
}

/** 予約キャンセル。期限内(またはforceRefund)ならチケットを返却 */
export async function cancelReservation(id: string, forceRefund = false) {
  return db.$transaction(async (tx) => {
    const r = await tx.reservation.findUnique({ where: { id }, include: { slot: true } });
    if (!r || r.status === "CANCELED") throw new BookingError("キャンセルできる予約がありません");
    const setting = await tx.setting.findUnique({ where: { id: 1 } });
    const deadline = r.slot.startsAt.getTime() - (setting?.cancelDeadlineHours ?? 24) * 3600_000;
    const refund = r.ticketsUsed > 0 && (forceRefund || Date.now() <= deadline || r.slot.status === "CANCELED");
    if (refund) await tx.member.update({ where: { id: r.memberId }, data: { tickets: { increment: r.ticketsUsed } } });
    await tx.reservation.update({ where: { id }, data: { status: "CANCELED", canceledAt: new Date() } });
    return { refunded: refund ? r.ticketsUsed : 0 };
  });
}
