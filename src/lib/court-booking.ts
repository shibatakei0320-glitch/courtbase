import "server-only";
import { db } from "./db";
import { addDays, fromJst } from "./format";

export const STEP_MIN = 30;
export const MAX_MIN = 180;
export const ADVANCE_DAYS = 30;

/** 期限切れの仮押さえ（支払われなかったコート予約）を削除 */
export async function clearExpiredHolds(courtId?: string) {
  await db.slot.deleteMany({
    where: { memberBooked: true, heldUntil: { lt: new Date() }, ...(courtId ? { courtId } : {}), reservations: { none: { status: { not: "CANCELED" } } } },
  });
}

/** 指定日のコートの埋まっている時間帯 */
export async function busyRanges(courtId: string, date: string) {
  const dayStart = fromJst(date);
  const dayEnd = fromJst(addDays(date, 1));
  const slots = await db.slot.findMany({
    where: { courtId, status: "OPEN", startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
    select: { startsAt: true, endsAt: true, heldUntil: true },
  });
  const now = Date.now();
  return slots.filter((s) => !s.heldUntil || s.heldUntil.getTime() > now).map((s) => [s.startsAt.getTime(), s.endsAt.getTime()] as const);
}

export const overlapsAny = (ranges: readonly (readonly [number, number])[], a: number, b: number) => ranges.some(([s, e]) => s < b && e > a);

export function hhmm(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function courtPrice(hourly: number, minutes: number) {
  return Math.round((hourly * minutes) / 60);
}
