import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { addDays, fromJst, jstDateKey } from "@/lib/format";
import { lineMessagingConfigured } from "@/lib/line-message";
import { notifyReminder } from "@/lib/notify";
import { clearExpiredHolds } from "@/lib/court-booking";

export const dynamic = "force-dynamic";

/** 毎日1回（Vercel Cron）: 翌日の予約をLINEでリマインド。送信済みは remindedAt で二重送信しない */
export async function GET() {
  await clearExpiredHolds();
  if (!lineMessagingConfigured()) return NextResponse.json({ skipped: "LINE_MESSAGING_TOKEN not set" });
  const tomorrow = addDays(jstDateKey(new Date()), 1);
  const list = await db.reservation.findMany({
    where: {
      status: "RESERVED",
      remindedAt: null,
      member: { OR: [{ lineUserId: { not: null } }, { guardian: { lineUserId: { not: null } } }] },
      slot: { status: "OPEN", startsAt: { gte: fromJst(tomorrow), lt: fromJst(addDays(tomorrow, 1)) } },
    },
    select: { id: true },
    take: 500,
  });
  let sent = 0;
  for (const r of list) {
    // 先に印を付けてから送る（同時実行でも二重送信しない）
    const { count } = await db.reservation.updateMany({ where: { id: r.id, remindedAt: null }, data: { remindedAt: new Date() } });
    if (count && (await notifyReminder(r.id))) sent++;
  }
  return NextResponse.json({ date: tomorrow, targets: list.length, sent });
}
