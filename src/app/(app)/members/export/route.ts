import type { MemberStatus } from "@prisma/client";
import { getCurrentStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { MEMBER_STATUS, fmtDate } from "@/lib/format";
import { audit } from "@/lib/audit";

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // CSVインジェクション対策
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function GET(req: Request) {
  const me = await getCurrentStaff();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q") ?? "";
  const status = sp.get("status");
  const members = await db.member.findMany({
    where: {
      ...(q ? { OR: [{ lastName: { contains: q } }, { firstName: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] } : {}),
      ...(status && status in MEMBER_STATUS ? { status: status as MemberStatus } : {}),
      ...(sp.get("plan") ? { planId: sp.get("plan")! } : {}),
    },
    include: { plan: true },
    orderBy: { memberNo: "asc" },
  });
  const rows = [
    ["会員番号", "姓", "名", "セイ", "メイ", "メール", "電話", "生年月日", "プラン", "ステータス", "入会日"],
    ...members.map((m) => [m.memberNo, m.lastName, m.firstName, m.lastKana, m.firstKana, m.email, m.phone, m.birthDate ? fmtDate(m.birthDate) : "", m.plan?.name, MEMBER_STATUS[m.status], fmtDate(m.joinedAt)]),
  ];
  await audit(me.id, "member.export", undefined, `${members.length}件`);
  const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="members.csv"` } });
}
