"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { parseMemberQr } from "@/lib/qr-token";
import { fmtTime, fromJst, jstDateKey } from "@/lib/format";

export type CheckinResult =
  | { ok: true; action: "IN" | "OUT" | "REPEAT"; name: string; memberNo: number; at: string; reservation?: string; warning?: string }
  | { ok: false; error: string };

/** QRコードの値、または会員番号で入場/退場を記録する（入場中なら退場、そうでなければ入場） */
export async function checkin(input: string): Promise<CheckinResult> {
  const me = await requireStaff();
  const value = input.trim();
  let member;
  if (/^\d{1,8}$/.test(value)) {
    member = await db.member.findUnique({ where: { memberNo: Number(value) } });
  } else {
    const id = parseMemberQr(value);
    if (!id) return { ok: false, error: "この施設の会員証ではありません" };
    member = await db.member.findUnique({ where: { id } });
  }
  if (!member) return { ok: false, error: "会員が見つかりません" };
  if (member.status === "WITHDRAWN") return { ok: false, error: `${member.lastName} ${member.firstName}さんは退会済みです` };

  const now = new Date();
  const todayStart = fromJst(jstDateKey(now));
  const name = `${member.lastName} ${member.firstName}`;
  const warning = member.status === "SUSPENDED" ? "休会中の会員です" : undefined;
  const open = await db.visit.findFirst({ where: { memberId: member.id, checkOutAt: null, checkInAt: { gte: todayStart } }, orderBy: { checkInAt: "desc" } });

  // 入場直後の読み取り重複は退場にしない
  if (open && now.getTime() - open.checkInAt.getTime() < 60_000) {
    return { ok: true, action: "REPEAT", name, memberNo: member.memberNo, at: fmtTime(open.checkInAt), warning };
  }
  if (open) {
    await db.visit.update({ where: { id: open.id }, data: { checkOutAt: now } });
    await audit(me.id, "visit.out", member.id, name);
    revalidatePath("/checkin");
    return { ok: true, action: "OUT", name, memberNo: member.memberNo, at: fmtTime(now), warning };
  }

  await db.visit.create({ data: { memberId: member.id, staffId: me.id, checkInAt: now } });
  // 前後1時間以内に始まる・実施中の予約を「出席」にする
  const res = await db.reservation.findFirst({
    where: {
      memberId: member.id,
      status: "RESERVED",
      slot: { status: "OPEN", startsAt: { lte: new Date(now.getTime() + 60 * 60_000) }, endsAt: { gte: now } },
    },
    include: { slot: true },
    orderBy: { slot: { startsAt: "asc" } },
  });
  if (res) await db.reservation.update({ where: { id: res.id }, data: { status: "ATTENDED" } });
  await audit(me.id, "visit.in", member.id, name);
  revalidatePath("/checkin");
  return {
    ok: true,
    action: "IN",
    name,
    memberNo: member.memberNo,
    at: fmtTime(now),
    reservation: res ? `${fmtTime(res.slot.startsAt)} ${res.slot.title}` : undefined,
    warning,
  };
}
