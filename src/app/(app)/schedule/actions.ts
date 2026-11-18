"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ReservationStatus, SlotKind } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { BookingError, book, cancelReservation } from "@/lib/booking";
import { int, optStr, str, type ActionState } from "@/lib/action";
import { fromJst } from "@/lib/format";

async function overlaps(courtId: string, start: Date, end: Date, excludeId?: string) {
  return db.slot.findFirst({
    where: { courtId, status: "OPEN", startsAt: { lt: end }, endsAt: { gt: start }, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
  });
}

export async function createSlot(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const program = optStr(fd, "programId") ? await db.program.findUnique({ where: { id: str(fd, "programId") } }) : null;
  const courtId = str(fd, "courtId");
  const date = str(fd, "date");
  const time = str(fd, "time");
  if (!courtId || !date || !time) return { error: "コート・日付・開始時刻を入力してください" };
  const title = str(fd, "title") || program?.name;
  if (!title) return { error: "タイトルを入力するか、プログラムを選択してください" };
  const duration = int(fd, "durationMin", program?.durationMin ?? 60);
  if (duration < 15 || duration > 24 * 60) return { error: "時間が不正です" };
  const kind = (str(fd, "kind") || program?.kind || "LESSON") as SlotKind;
  const repeat = Math.min(26, Math.max(1, int(fd, "repeatWeeks", 1)));
  const base = {
    title,
    kind,
    programId: program?.id ?? null,
    courtId,
    instructorId: optStr(fd, "instructorId"),
    capacity: Math.max(1, int(fd, "capacity", program?.capacity ?? 1)),
    price: Math.max(0, int(fd, "price", program?.price ?? 0)),
    ticketCost: Math.max(0, int(fd, "ticketCost", program?.ticketCost ?? 0)),
    note: optStr(fd, "note"),
  };
  const start0 = fromJst(date, time);
  const rows = [];
  for (let w = 0; w < repeat; w++) {
    const startsAt = new Date(start0.getTime() + w * 7 * 86400_000);
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);
    const clash = await overlaps(courtId, startsAt, endsAt);
    if (clash) return { error: `${startsAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} は「${clash.title}」と時間が重複しています` };
    rows.push({ ...base, startsAt, endsAt });
  }
  await db.slot.createMany({ data: rows });
  await audit(me.id, "slot.create", title, `${rows.length}件`);
  redirect(`/schedule?date=${date}`);
}

export async function updateSlot(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const id = str(fd, "id");
  const startsAt = fromJst(str(fd, "date"), str(fd, "time"));
  const endsAt = new Date(startsAt.getTime() + int(fd, "durationMin", 60) * 60_000);
  const courtId = str(fd, "courtId");
  const clash = await overlaps(courtId, startsAt, endsAt, id);
  if (clash) return { error: `「${clash.title}」と時間が重複しています` };
  const capacity = Math.max(1, int(fd, "capacity", 1));
  const booked = await db.reservation.count({ where: { slotId: id, status: { in: ["RESERVED", "ATTENDED"] } } });
  if (capacity < booked) return { error: `定員を予約数（${booked}名）未満にはできません` };
  await db.slot.update({
    where: { id },
    data: { title: str(fd, "title"), courtId, startsAt, endsAt, capacity, price: Math.max(0, int(fd, "price")), ticketCost: Math.max(0, int(fd, "ticketCost")), instructorId: optStr(fd, "instructorId"), note: optStr(fd, "note") },
  });
  await audit(me.id, "slot.update", id);
  revalidatePath(`/schedule/${id}`);
  return { ok: "枠を更新しました" };
}

export async function cancelSlot(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const id = str(fd, "id");
  await db.slot.update({ where: { id }, data: { status: "CANCELED" } });
  const active = await db.reservation.findMany({ where: { slotId: id, status: "RESERVED" } });
  for (const r of active) await cancelReservation(r.id, true);
  await audit(me.id, "slot.cancel", id, `予約${active.length}件をキャンセル`);
  revalidatePath(`/schedule/${id}`);
  return { ok: `枠を中止しました（予約 ${active.length} 件をキャンセルし、チケットを返却しました）` };
}

export async function deleteSlot(fd: FormData) {
  const me = await requireStaff(["OWNER", "ADMIN"]);
  const id = str(fd, "id");
  const has = await db.reservation.count({ where: { slotId: id, status: { not: "CANCELED" } } });
  if (has > 0) throw new Error("有効な予約がある枠は削除できません。先に中止してください");
  const slot = await db.slot.delete({ where: { id } });
  await audit(me.id, "slot.delete", slot.title);
  redirect("/schedule");
}

export async function addReservation(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const slotId = str(fd, "slotId");
  const memberId = str(fd, "memberId");
  try {
    const r = await book(slotId, memberId);
    await audit(me.id, "reservation.create", r.id);
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/schedule/${slotId}`);
  return { ok: "予約を登録しました" };
}

export async function setReservationStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const id = str(fd, "id");
  const status = str(fd, "status") as ReservationStatus;
  let msg = "更新しました";
  try {
    if (status === "CANCELED") {
      const { refunded } = await cancelReservation(id, fd.get("refund") === "1");
      msg = refunded ? `キャンセルしました（チケット${refunded}枚返却）` : "キャンセルしました（期限超過のため返却なし）";
    } else if (["RESERVED", "ATTENDED", "NO_SHOW"].includes(status)) {
      const r = await db.reservation.findUniqueOrThrow({ where: { id } });
      if (r.status === "CANCELED") return { error: "キャンセル済みの予約は変更できません" };
      await db.reservation.update({ where: { id }, data: { status } });
    } else return { error: "不正なステータスです" };
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  await audit(me.id, "reservation.status", id, status);
  revalidatePath("/schedule/[id]", "page");
  revalidatePath("/reservations");
  return { ok: msg };
}
