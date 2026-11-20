import "server-only";
import { db } from "./db";
import { pushLine } from "./line-message";
import { appUrl } from "./url";
import { fmtTime, jstDateKey, yen } from "./format";
import { categoryLabel, entryName } from "./entry";

const WD = ["日", "月", "火", "水", "木", "金", "土"];
function when(start: Date, end: Date) {
  const [, m, d] = jstDateKey(start).split("-").map(Number);
  const w = WD[new Date(start.getTime() + 9 * 3600_000).getUTCDay()];
  return `${m}/${d}(${w}) ${fmtTime(start)}–${fmtTime(end)}`;
}

async function load(reservationId: string) {
  const [r, s] = await Promise.all([
    db.reservation.findUnique({ where: { id: reservationId }, include: { member: true, category: true, slot: { include: { court: true } } } }),
    db.setting.findUnique({ where: { id: 1 } }),
  ]);
  return r ? { r, name: s?.facilityName ?? "pickleland" } : null;
}

function body(r: NonNullable<Awaited<ReturnType<typeof load>>>["r"]) {
  const entry = r.category ? `\n種目：${categoryLabel(r.category)}${r.players.length > 1 || r.teamName ? `\nエントリー：${entryName(r)}` : ""}` : "";
  return `${when(r.slot.startsAt, r.slot.endsAt)}\n${r.slot.title}\n${r.slot.court.name}${entry}`;
}

export async function notifyBooked(reservationId: string, amount = 0) {
  const x = await load(reservationId);
  if (!x) return;
  if (x.r.kind === "MAKEUP") {
    await pushLine(x.r.member.lineUserId, `【${x.name}】振替の予約が確定しました\n\n${body(x.r)}\n\n取り消すと振替は戻ります。\n${appUrl()}/my/school`);
    return;
  }
  await pushLine(
    x.r.member.lineUserId,
    `【${x.name}】予約が確定しました\n\n${body(x.r)}${amount > 0 ? `\n料金 ${yen(amount)}（お支払い済み）` : ""}\n\n入退場の際は会員証のQRコードを受付でお見せください。\n${appUrl()}/my/card`,
  );
}

export async function notifyCanceled(reservationId: string, refunded: number, byFacility = false) {
  const x = await load(reservationId);
  if (!x) return;
  const head = byFacility ? "施設の都合により、次の予約を中止しました。申し訳ありません。" : "次の予約をキャンセルしました。";
  const refund = refunded > 0 ? `\n\n${yen(refunded)}を返金しました。カード会社によって、明細への反映まで数日〜2週間ほどかかります。` : "";
  await pushLine(x.r.member.lineUserId, `【${x.name}】${head}\n\n${body(x.r)}${refund}`);
}

export async function notifyReminder(reservationId: string) {
  const x = await load(reservationId);
  if (!x) return false;
  return pushLine(
    x.r.member.lineUserId,
    `【${x.name}】明日のご予約のお知らせです\n\n${body(x.r)}\n\n会員証（入退場用QRコード）\n${appUrl()}/my/card`,
  );
}

/** 種目に空きが出たとき、キャンセル待ちの全員に先着順の案内を送る */
export async function notifyWaitlist(categoryId: string) {
  const cat = await db.eventCategory.findUnique({ where: { id: categoryId }, include: { slot: true } });
  if (!cat || cat.slot.status !== "OPEN" || cat.slot.startsAt <= new Date()) return 0;
  const taken = await db.reservation.count({ where: { categoryId, status: { in: ["RESERVED", "ATTENDED"] } } });
  if (taken >= cat.capacity) return 0;
  const list = await db.waitlist.findMany({ where: { categoryId }, include: { member: true }, orderBy: { createdAt: "asc" } });
  if (!list.length) return 0;
  const s = await db.setting.findUnique({ where: { id: 1 } });
  const name = s?.facilityName ?? "pickleland";
  const label = cat.level ? `${cat.name}（${cat.level}）` : cat.name;
  let sent = 0;
  for (const w of list) {
    const ok = await pushLine(
      w.member.lineUserId,
      `【${name}】キャンセル待ちの種目に空きが出ました\n\n${cat.slot.title}\n${label}\n\nエントリーは先着順です。ご希望の方はお早めにお申し込みください。\n${appUrl()}/my/events/${cat.slotId}`,
    );
    if (ok) sent++;
  }
  await db.waitlist.updateMany({ where: { categoryId }, data: { notifiedAt: new Date() } });
  return sent;
}

// ---- スクール ----

/** 欠席連絡の受付（Web・スタッフ受付のとき。LINEからの欠席はその場で応答する） */
export async function notifyAbsence(reservationId: string, creditExpires: Date | null) {
  const x = await load(reservationId);
  if (!x) return;
  const credit = creditExpires ? `\n\n振替が1回分付きました（${jstDateKey(creditExpires).replaceAll("-", "/")}まで）。「振替予約」から空きのある回を選べます。` : "";
  await pushLine(x.r.member.lineUserId, `【${x.name}】欠席を受け付けました\n\n${body(x.r)}${credit}`);
}

export async function notifyMakeupCanceled(reservationId: string) {
  const x = await load(reservationId);
  if (!x) return;
  await pushLine(x.r.member.lineUserId, `【${x.name}】振替の予約を取り消しました\n\n${body(x.r)}\n\n振替は戻っています。別の回を選べます。`);
}

/** 休講のお知らせ（在籍者・振替予定者） */
export async function notifyLessonCanceled(reservationId: string) {
  const x = await load(reservationId);
  if (!x) return;
  await pushLine(x.r.member.lineUserId, `【${x.name}】次のレッスンは休講になりました。申し訳ありません。\n\n${body(x.r)}\n\n振替が1回分付いています。「振替予約」から空きのある回を選べます。\n${appUrl()}/my/school`);
}
