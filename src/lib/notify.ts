import "server-only";
import { db } from "./db";
import { pushLine } from "./line-message";
import { appUrl } from "./url";
import { fmtTime, jstDateKey, yen } from "./format";

const WD = ["日", "月", "火", "水", "木", "金", "土"];
function when(start: Date, end: Date) {
  const [, m, d] = jstDateKey(start).split("-").map(Number);
  const w = WD[new Date(start.getTime() + 9 * 3600_000).getUTCDay()];
  return `${m}/${d}(${w}) ${fmtTime(start)}–${fmtTime(end)}`;
}

async function load(reservationId: string) {
  const [r, s] = await Promise.all([
    db.reservation.findUnique({ where: { id: reservationId }, include: { member: true, slot: { include: { court: true } } } }),
    db.setting.findUnique({ where: { id: 1 } }),
  ]);
  return r ? { r, name: s?.facilityName ?? "pickleland" } : null;
}

function body(r: NonNullable<Awaited<ReturnType<typeof load>>>["r"]) {
  return `${when(r.slot.startsAt, r.slot.endsAt)}\n${r.slot.title}\n${r.slot.court.name}`;
}

export async function notifyBooked(reservationId: string, amount = 0) {
  const x = await load(reservationId);
  if (!x) return;
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
