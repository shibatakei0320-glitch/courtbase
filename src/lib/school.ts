import "server-only";
import type { ClassTarget, Prisma } from "@prisma/client";
import { db } from "./db";
import { BookingError } from "./booking";
import { addDays, fromJst, jstDateKey } from "./format";

/*
 * スクール（定期クラス・欠席連絡・振替）のルール
 *
 * - クラスの回は Slot（classId 付き）。在籍会員の出席予定は Reservation(kind=REGULAR) として自動で入る
 * - 会員が欠席連絡すると REGULAR 予約を CANCELED にし、振替の権利（MakeupCredit）を1つ発行する
 * - 振替予約は MakeupCredit を1つ使って、空きのある別の回に Reservation(kind=MAKEUP) を作る
 * - 振替予約をキャンセル（期限内）すると権利は戻る。休講になった回の在籍者にも権利を発行する
 * - 定員は「在籍の出席予定＋振替」の合計。欠席者の席は振替で使える
 */

const ACTIVE = { in: ["RESERVED", "ATTENDED"] } as Prisma.EnumReservationStatusFilter;
export const LEVEL_RULE = { SAME: "同じレベルのみ", SAME_OR_LOWER: "同じか下のレベル", ANY: "レベル制限なし" } as const;
export type LevelRule = keyof typeof LEVEL_RULE;
export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export async function schoolSettings() {
  const s = await db.setting.findUnique({ where: { id: 1 } });
  const rule = (s?.makeupLevelRule ?? "SAME_OR_LOWER") as LevelRule;
  return {
    absenceDeadlineHours: s?.absenceDeadlineHours ?? 0,
    makeupValidDays: s?.makeupValidDays ?? 60,
    levelRule: rule in LEVEL_RULE ? rule : ("SAME_OR_LOWER" as LevelRule),
    cancelDeadlineHours: s?.cancelDeadlineHours ?? 24,
  };
}

/** JSTの日付キーの曜日（0=日） */
export function weekdayOf(dateKey: string) {
  return new Date(fromJst(dateKey).getTime() + 9 * 3600_000).getUTCDay();
}

/** 在籍がその時刻の回に有効か（endDate はその日を含む） */
export function enrollmentCovers(e: { startDate: Date; endDate: Date | null }, at: Date) {
  if (at < e.startDate) return false;
  if (e.endDate && at.getTime() >= e.endDate.getTime() + 86400_000) return false;
  return true;
}

/** 振替先として選べるレベルか */
export function levelAllowed(rule: LevelRule, fromRank: number | null | undefined, toRank: number | null | undefined) {
  if (rule === "ANY" || fromRank == null || toRank == null) return true;
  return rule === "SAME" ? toRank === fromRank : toRank <= fromRank;
}

/** 一般とジュニアはまたいで振替できない（区分のない権利はどちらにも使える） */
export function targetAllowed(from: ClassTarget | null | undefined, to: ClassTarget | null | undefined) {
  return !from || !to || from === to;
}
export const TARGET_LABEL: Record<ClassTarget, string> = { ADULT: "一般", JUNIOR: "ジュニア" };

/**
 * 学年（日本の学校年度：4月2日〜翌4月1日生まれが同じ学年）。
 * 未就学は 年少・年中・年長、高校生より上は年齢
 */
export function gradeLabel(birth: Date | null | undefined, at = new Date()) {
  if (!birth) return null;
  const [by, bm, bd] = jstDateKey(birth).split("-").map(Number);
  const [ay, am] = jstDateKey(at).split("-").map(Number);
  const cohort = bm > 4 || (bm === 4 && bd >= 2) ? by : by - 1; // 小1になる年 = cohort + 7
  const schoolYear = am >= 4 ? ay : ay - 1;
  const g = schoolYear - cohort - 6;
  if (g >= 1 && g <= 6) return `小${g}`;
  if (g >= 7 && g <= 9) return `中${g - 6}`;
  if (g >= 10 && g <= 12) return `高${g - 9}`;
  if (g === 0) return "年長";
  if (g === -1) return "年中";
  if (g === -2) return "年少";
  if (g > 12) return null;
  return "未就学";
}

/** 欠席連絡の期限 */
export function absenceDeadline(startsAt: Date, hours: number) {
  return new Date(startsAt.getTime() - hours * 3600_000);
}

/**
 * クラスの回を期間内（from〜to、JSTの日付・両端含む）に生成する。
 * 既にある回はそのまま。コートが他の枠と重なる日は作らずに返す。
 */
export async function generateLessons(classId: string, from: string, to: string) {
  const c = await db.schoolClass.findUnique({ where: { id: classId } });
  if (!c) throw new BookingError("クラスが見つかりません");
  if (!c.active) throw new BookingError(`「${c.name}」は停止中です`);
  const created: Date[] = [];
  const skipped: { date: string; reason: string }[] = [];
  for (let key = from; key <= to; key = addDays(key, 1)) {
    if (weekdayOf(key) !== c.weekday) continue;
    const startsAt = fromJst(key, c.startTime);
    const endsAt = new Date(startsAt.getTime() + c.durationMin * 60_000);
    if (startsAt <= new Date()) continue;
    const exists = await db.slot.findUnique({ where: { classId_startsAt: { classId, startsAt } } });
    if (exists) continue;
    const clash = await db.slot.findFirst({ where: { courtId: c.courtId, status: "OPEN", startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
    if (clash) {
      skipped.push({ date: key, reason: `「${clash.title}」と重複` });
      continue;
    }
    await db.slot.create({
      data: { title: c.name, kind: "LESSON", classId, courtId: c.courtId, instructorId: c.coachId, startsAt, endsAt, capacity: c.capacity, price: 0 },
    });
    created.push(startsAt);
  }
  await syncClassReservations(classId);
  return { created: created.length, skipped };
}

/**
 * これから先の回について、在籍と出席予定（REGULAR）をそろえる。
 * - 在籍期間内で、まだ予定がない会員 → 出席予定を作る（欠席連絡済み＝CANCELED の REGULAR があれば作らない）
 * - 在籍期間外になった会員の出席予定 → 消す（欠席連絡などの記録は残す）
 */
export async function syncClassReservations(classId: string, memberId?: string) {
  const now = new Date();
  const [slots, enrollments] = await Promise.all([
    db.slot.findMany({
      where: { classId, status: "OPEN", startsAt: { gt: now } },
      include: { reservations: { where: memberId ? { memberId } : {}, select: { id: true, memberId: true, kind: true, status: true } } },
    }),
    db.enrollment.findMany({ where: { classId, ...(memberId ? { memberId } : {}), member: { status: "ACTIVE" } }, include: { member: { select: { leaves: true } } } }),
  ]);
  let added = 0;
  let removed = 0;
  for (const s of slots) {
    const want = new Set(enrollments.filter((e) => enrollmentCovers(e, s.startsAt) && !onLeave(e.member.leaves, s.startsAt)).map((e) => e.memberId));
    for (const m of want) {
      const has = s.reservations.some((r) => r.memberId === m && (r.kind === "REGULAR" || r.status === "RESERVED" || r.status === "ATTENDED"));
      if (!has) {
        await db.reservation.create({ data: { slotId: s.id, memberId: m, kind: "REGULAR" } });
        added++;
      }
    }
    for (const r of s.reservations) {
      if (r.kind === "REGULAR" && r.status === "RESERVED" && !want.has(r.memberId)) {
        await db.reservation.delete({ where: { id: r.id } });
        removed++;
      }
    }
  }
  return { added, removed };
}

/** JSTの年月 "YYYY-MM" */
export const monthKey = (d: Date) => jstDateKey(d).slice(0, 7);

/** 休会中か（月単位、両端含む） */
export function onLeave(leaves: { fromMonth: string; toMonth: string }[], at: Date) {
  const m = monthKey(at);
  return leaves.some((l) => l.fromMonth <= m && m <= l.toMonth);
}

/** 会員の在籍クラスすべてについて出席予定をそろえる（休会・在籍変更の後に呼ぶ） */
export async function syncMember(memberId: string) {
  const classIds = [...new Set((await db.enrollment.findMany({ where: { memberId }, select: { classId: true } })).map((e) => e.classId))];
  let added = 0;
  let removed = 0;
  for (const id of classIds) {
    const r = await syncClassReservations(id, memberId);
    added += r.added;
    removed += r.removed;
  }
  return { added, removed };
}

/** 在籍中の人数（今日時点） */
export async function enrolledCount(classId: string, at = new Date()) {
  const list = await db.enrollment.findMany({ where: { classId, member: { status: "ACTIVE" } } });
  return list.filter((e) => enrollmentCovers(e, at) || e.startDate > at).length;
}

/** 欠席の記録と振替の権利の発行。issueCredit=false なら権利なしの欠席 */
export async function recordAbsence(reservationId: string, opts: { reason?: string; issueCredit?: boolean; staffId?: string | null } = {}) {
  const { makeupValidDays } = await schoolSettings();
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Reservation" WHERE id = ${reservationId} FOR UPDATE`;
    const r = await tx.reservation.findUnique({ where: { id: reservationId }, include: { slot: { include: { schoolClass: { include: { level: true } } } } } });
    if (!r || r.kind !== "REGULAR") throw new BookingError("クラスの出席予定ではありません");
    if (r.status !== "RESERVED") throw new BookingError("この回はすでに欠席連絡済み、または出欠が確定しています");
    await tx.reservation.update({ where: { id: r.id }, data: { status: "CANCELED", canceledAt: new Date() } });
    if (opts.issueCredit === false) return null;
    return tx.makeupCredit.create({
      data: {
        memberId: r.memberId,
        reason: opts.reason ?? "欠席連絡",
        sourceReservationId: r.id,
        levelRank: r.slot.schoolClass?.level?.rank ?? null,
        target: r.slot.schoolClass?.target ?? null,
        expiresAt: new Date(r.slot.startsAt.getTime() + makeupValidDays * 86400_000),
        staffId: opts.staffId ?? null,
      },
    });
  });
}

/** 欠席連絡の取り消し（席が空いていれば出席予定に戻し、未使用の振替の権利は無効にする） */
export async function undoAbsence(reservationId: string) {
  return db.$transaction(async (tx) => {
    const r0 = await tx.reservation.findUnique({ where: { id: reservationId } });
    if (!r0) throw new BookingError("予約が見つかりません");
    await tx.$queryRaw`SELECT id FROM "Slot" WHERE id = ${r0.slotId} FOR UPDATE`;
    const r = await tx.reservation.findUnique({ where: { id: reservationId }, include: { slot: true } });
    if (!r || r.kind !== "REGULAR" || r.status !== "CANCELED") throw new BookingError("取り消せる欠席連絡がありません");
    if (r.slot.status !== "OPEN" || r.slot.startsAt <= new Date()) throw new BookingError("この回は取り消しできません");
    const credit = await tx.makeupCredit.findUnique({ where: { sourceReservationId: r.id } });
    if (credit && credit.status !== "AVAILABLE") throw new BookingError("この欠席分の振替はすでに使われています");
    const count = await tx.reservation.count({ where: { slotId: r.slotId, status: ACTIVE } });
    if (count >= r.slot.capacity) throw new BookingError("振替の予約で席が埋まったため、元に戻せません");
    await tx.reservation.update({ where: { id: r.id }, data: { status: "RESERVED", canceledAt: null } });
    if (credit) await tx.makeupCredit.update({ where: { id: credit.id }, data: { status: "VOID", sourceReservationId: null, note: "欠席連絡を取り消し" } });
  });
}

/** 振替の権利を使って、クラスの回を予約する */
export async function bookMakeup(creditId: string, slotId: string, memberId: string) {
  const { levelRule } = await schoolSettings();
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Slot" WHERE id = ${slotId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "MakeupCredit" WHERE id = ${creditId} FOR UPDATE`;
    const [slot, credit, member] = await Promise.all([
      tx.slot.findUnique({ where: { id: slotId }, include: { schoolClass: { include: { level: true } } } }),
      tx.makeupCredit.findUnique({ where: { id: creditId } }),
      tx.member.findUnique({ where: { id: memberId } }),
    ]);
    if (!member || member.status !== "ACTIVE") throw new BookingError("有効な会員ではありません（休会・退会中）");
    if (!credit || credit.memberId !== memberId || credit.status !== "AVAILABLE") throw new BookingError("使える振替がありません");
    if (!slot || !slot.classId || slot.status !== "OPEN") throw new BookingError("この回は振替できません");
    if (slot.startsAt <= new Date()) throw new BookingError("開始済みの回には振替できません");
    if (slot.startsAt > credit.expiresAt) throw new BookingError("振替の有効期限より後の回です");
    if (!levelAllowed(levelRule, credit.levelRank, slot.schoolClass?.level?.rank)) throw new BookingError("この回のレベルには振替できません");
    if (!targetAllowed(credit.target, slot.schoolClass?.target)) throw new BookingError(credit.target === "JUNIOR" ? "ジュニアの振替は、ジュニアクラスの回にのみ使えます" : "一般の振替は、一般クラスの回にのみ使えます");
    const dup = await tx.reservation.findFirst({ where: { slotId, memberId, OR: [{ status: ACTIVE }, { kind: "REGULAR" }] } });
    if (dup) throw new BookingError(dup.kind === "REGULAR" ? "在籍しているクラスの回には振替できません（欠席連絡の取り消しをご利用ください）" : "この回はすでに予約済みです");
    const count = await tx.reservation.count({ where: { slotId, status: ACTIVE } });
    if (count >= slot.capacity) throw new BookingError("この回は満員です");
    const r = await tx.reservation.create({ data: { slotId, memberId, kind: "MAKEUP" } });
    await tx.makeupCredit.update({ where: { id: credit.id }, data: { status: "USED", usedReservationId: r.id } });
    return r;
  });
}

/** 振替予約の取り消し。権利を戻す（期限切れでも戻すが、使えるのは期限内の回のみ） */
export async function cancelMakeup(reservationId: string) {
  return db.$transaction(async (tx) => {
    const r = await tx.reservation.findUnique({ where: { id: reservationId } });
    if (!r || r.kind !== "MAKEUP" || r.status === "CANCELED") throw new BookingError("取り消せる振替予約がありません");
    await tx.reservation.update({ where: { id: r.id }, data: { status: "CANCELED", canceledAt: new Date() } });
    const credit = await tx.makeupCredit.findUnique({ where: { usedReservationId: r.id } });
    if (credit) await tx.makeupCredit.update({ where: { id: credit.id }, data: { status: "AVAILABLE", usedReservationId: null } });
    return r;
  });
}

/** 休講：回を中止し、在籍者には振替の権利を発行、振替で来る予定だった人には権利を戻す */
export async function cancelLesson(slotId: string, staffId: string | null) {
  await db.slot.update({ where: { id: slotId }, data: { status: "CANCELED" } });
  const list = await db.reservation.findMany({ where: { slotId, status: "RESERVED" } });
  let credited = 0;
  const notified: string[] = [];
  for (const r of list) {
    if (r.kind !== "NORMAL") notified.push(r.id);
    if (r.kind === "REGULAR") {
      await recordAbsence(r.id, { reason: "休講", staffId });
      credited++;
    } else if (r.kind === "MAKEUP") {
      await cancelMakeup(r.id);
      credited++;
    } else {
      await db.reservation.update({ where: { id: r.id }, data: { status: "CANCELED", canceledAt: new Date() } });
    }
  }
  return { affected: list.length, credited, notified };
}

/** 会員の使える振替の権利（期限の近い順） */
export function availableCredits(memberId: string) {
  return db.makeupCredit.findMany({ where: { memberId, status: "AVAILABLE", expiresAt: { gt: new Date() } }, orderBy: { expiresAt: "asc" } });
}

/** 振替先の候補（空きあり・期限内・レベル条件を満たす、まだ予約していない回） */
export async function makeupCandidates(memberId: string, credit: { levelRank: number | null; target?: ClassTarget | null; expiresAt: Date }) {
  const { levelRule } = await schoolSettings();
  const slots = await db.slot.findMany({
    where: { classId: { not: null }, status: "OPEN", startsAt: { gt: new Date(), lte: credit.expiresAt } },
    include: {
      court: true,
      instructor: { select: { name: true } },
      schoolClass: { include: { level: true } },
      reservations: { where: { OR: [{ status: ACTIVE }, { memberId, kind: "REGULAR" }] }, select: { memberId: true, status: true } },
    },
    orderBy: { startsAt: "asc" },
    take: 300,
  });
  return slots
    .filter((s) => levelAllowed(levelRule, credit.levelRank, s.schoolClass?.level?.rank))
    .filter((s) => targetAllowed(credit.target, s.schoolClass?.target))
    .filter((s) => !s.reservations.some((r) => r.memberId === memberId))
    .map((s) => ({ ...s, left: s.capacity - s.reservations.filter((r) => r.status === "RESERVED" || r.status === "ATTENDED").length }))
    .filter((s) => s.left > 0);
}

export function todayKey() {
  return jstDateKey(new Date());
}

/** 会員本人による欠席連絡（期限を確認してから記録し、振替の権利を返す） */
export async function memberReportAbsence(memberId: string, reservationId: string) {
  const r = await db.reservation.findFirst({ where: { id: reservationId, memberId, kind: "REGULAR" }, include: { slot: true } });
  if (!r) throw new BookingError("欠席連絡できる回がありません");
  if (r.status !== "RESERVED") throw new BookingError("この回はすでに欠席連絡済みです");
  if (r.slot.status !== "OPEN") throw new BookingError("この回は休講です（振替は付与済みです）");
  const { absenceDeadlineHours } = await schoolSettings();
  if (Date.now() > absenceDeadline(r.slot.startsAt, absenceDeadlineHours).getTime())
    throw new BookingError(`欠席連絡の期限（${absenceDeadlineHours > 0 ? `開始の${absenceDeadlineHours}時間前` : "開始時刻"}）を過ぎています。スクールに直接ご連絡ください`);
  const credit = await recordAbsence(r.id);
  return { reservation: r, credit };
}

/** 欠席連絡できるこれからの回（在籍クラスの出席予定、期限内のもの） */
export async function absentableLessons(memberId: string, limit = 10) {
  const { absenceDeadlineHours } = await schoolSettings();
  const list = await db.reservation.findMany({
    where: { memberId, kind: "REGULAR", status: "RESERVED", slot: { status: "OPEN", startsAt: { gt: new Date() } } },
    include: { slot: true },
    orderBy: { slot: { startsAt: "asc" } },
    take: limit + 5,
  });
  return list.filter((r) => Date.now() <= absenceDeadline(r.slot.startsAt, absenceDeadlineHours).getTime()).slice(0, limit);
}
