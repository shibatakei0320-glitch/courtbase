"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ReservationStatus, SlotKind } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { BookingError, book, bookEntry, cancelReservation } from "@/lib/booking";
import { bool, int, optStr, str, type ActionState } from "@/lib/action";
import type { EntryFormat } from "@prisma/client";
import { entrySize } from "@/lib/entry";
import { pushLine, lineMessagingConfigured } from "@/lib/line-message";
import { fromJst, yen } from "@/lib/format";
import { refundReservation } from "@/lib/refund";
import { clearExpiredHolds } from "@/lib/court-booking";
import { notifyBooked, notifyCanceled } from "@/lib/notify";

async function overlaps(courtId: string, start: Date, end: Date, excludeId?: string) {
  await clearExpiredHolds(courtId);
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
    data: { title: str(fd, "title"), courtId, startsAt, endsAt, capacity, price: Math.max(0, int(fd, "price")), instructorId: optStr(fd, "instructorId"), note: optStr(fd, "note") },
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
  let refunded = 0;
  for (const r of active) {
    await cancelReservation(r.id);
    const amt = await refundReservation(r.id, "施設都合による中止");
    refunded += amt;
    await notifyCanceled(r.id, amt, true);
  }
  await audit(me.id, "slot.cancel", id, `予約${active.length}件をキャンセル 返金${refunded}`);
  revalidatePath(`/schedule/${id}`);
  return { ok: `枠を中止しました（予約 ${active.length} 件をキャンセル${refunded > 0 ? `、${yen(refunded)}を返金` : ""}）` };
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
  const categoryId = str(fd, "categoryId");
  try {
    let r;
    if (categoryId) {
      const [cat, m] = await Promise.all([db.eventCategory.findUnique({ where: { id: categoryId } }), db.member.findUnique({ where: { id: memberId } })]);
      if (!cat || !m) return { error: "種目または会員が見つかりません" };
      const others = str(fd, "players").split(/[\n,、]/).map((x) => x.trim()).filter(Boolean).slice(0, 20);
      const need = entrySize(cat) - 1;
      if (others.length < need) return { error: `代表者以外のメンバーの名前を${need}名分入力してください（1行に1名）` };
      const teamName = cat.format === "TEAM" ? optStr(fd, "teamName") : null;
      if (cat.format === "TEAM" && !teamName) return { error: "チーム名を入力してください" };
      r = await bookEntry(slotId, categoryId, memberId, { teamName, players: [`${m.lastName} ${m.firstName}`, ...others.slice(0, need)] });
    } else {
      r = await book(slotId, memberId);
    }
    await audit(me.id, "reservation.create", r.id);
    await notifyBooked(r.id);
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
      await cancelReservation(id);
      const amt = await refundReservation(id, "スタッフによる取消");
      await notifyCanceled(id, amt);
      msg = amt > 0 ? `キャンセルし、${yen(amt)}を返金しました` : "キャンセルしました";
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

// ---- 大会の種目 ----

const FORMATS: EntryFormat[] = ["SINGLES", "DOUBLES", "TEAM"];

async function syncEventCapacity(slotId: string) {
  // 種目がある大会は、枠全体の定員を種目の定員の合計にそろえる
  const cats = await db.eventCategory.findMany({ where: { slotId }, select: { capacity: true } });
  if (cats.length) await db.slot.update({ where: { id: slotId }, data: { capacity: cats.reduce((a, c) => a + c.capacity, 0) } });
}

export async function saveCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff(["OWNER", "ADMIN"]);
  const id = str(fd, "id");
  const slotId = str(fd, "slotId");
  const name = str(fd, "name");
  const format = str(fd, "format") as EntryFormat;
  if (!name) return { error: "種目名を入力してください" };
  if (!FORMATS.includes(format)) return { error: "形式を選んでください" };
  const data = {
    name,
    format,
    level: optStr(fd, "level"),
    teamSize: Math.min(20, Math.max(2, int(fd, "teamSize", 4))),
    capacity: Math.max(1, int(fd, "capacity", 16)),
    price: Math.max(0, int(fd, "price")),
    sortOrder: int(fd, "sortOrder"),
  };
  if (id) {
    const used = await db.reservation.count({ where: { categoryId: id, status: { in: ["RESERVED", "ATTENDED"] } } });
    const cur = await db.eventCategory.findUnique({ where: { id } });
    if (cur && used > 0 && cur.format !== format) return { error: "エントリーがある種目の形式は変更できません" };
    if (used > data.capacity) return { error: `すでに${used}組がエントリーしています。定員はそれ以上にしてください` };
    await db.eventCategory.update({ where: { id }, data });
    await audit(me.id, "category.update", id, name);
  } else {
    const c = await db.eventCategory.create({ data: { ...data, slotId } });
    await audit(me.id, "category.create", c.id, name);
  }
  await syncEventCapacity(slotId);
  revalidatePath(`/schedule/${slotId}`);
  return { ok: id ? "種目を更新しました" : "種目を追加しました" };
}

export async function deleteCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff(["OWNER", "ADMIN"]);
  const id = str(fd, "id");
  const cat = await db.eventCategory.findUnique({ where: { id } });
  if (!cat) return { error: "種目が見つかりません" };
  const used = await db.reservation.count({ where: { categoryId: id, status: { not: "CANCELED" } } });
  if (used > 0) return { error: "エントリーがある種目は削除できません" };
  await db.eventCategory.delete({ where: { id } });
  await audit(me.id, "category.delete", id, cat.name);
  await syncEventCapacity(cat.slotId);
  revalidatePath(`/schedule/${cat.slotId}`);
  return { ok: "種目を削除しました" };
}

export async function setPublicEntries(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff(["OWNER", "ADMIN"]);
  const id = str(fd, "slotId");
  const on = bool(fd, "publicEntries");
  await db.slot.update({ where: { id }, data: { publicEntries: on } });
  await audit(me.id, "slot.public_entries", id, on ? "公開" : "非公開");
  revalidatePath(`/schedule/${id}`);
  return { ok: on ? "エントリー一覧を会員ページに公開しました" : "エントリー一覧を非公開にしました" };
}

/** 大会の参加者（代表者）のLINEへ一括送信 */
export async function sendEventMessage(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const slotId = str(fd, "slotId");
  const categoryId = str(fd, "categoryId") || null;
  const body = str(fd, "body");
  if (!body) return { error: "本文を入力してください" };
  if (body.length > 2000) return { error: "本文は2000文字以内にしてください" };
  if (!lineMessagingConfigured()) return { error: "LINE公式アカウントの設定がまだのため送信できません" };
  const [slot, setting] = await Promise.all([db.slot.findUnique({ where: { id: slotId } }), db.setting.findUnique({ where: { id: 1 } })]);
  if (!slot) return { error: "大会が見つかりません" };
  const res = await db.reservation.findMany({
    where: { slotId, status: { in: ["RESERVED", "ATTENDED"] }, ...(categoryId ? { categoryId } : {}) },
    include: { member: { select: { id: true, lineUserId: true } } },
  });
  const members = new Map(res.map((r) => [r.member.id, r.member.lineUserId]));
  if (members.size === 0) return { error: "送信先の参加者がいません" };
  const text = `【${setting?.facilityName ?? "pickleland"}】${slot.title}\n\n${body}`;
  let sent = 0;
  for (const lineId of members.values()) if (await pushLine(lineId, text)) sent++;
  await db.eventMessage.create({ data: { slotId, categoryId, body, sentCount: sent, totalCount: members.size, staffId: me.id } });
  await audit(me.id, "event.message", slotId, `${sent}/${members.size}`);
  revalidatePath(`/schedule/${slotId}`);
  const missed = members.size - sent;
  return { ok: `${sent}名に送信しました${missed ? `（LINE未連携などで${missed}名には届いていません）` : ""}` };
}
