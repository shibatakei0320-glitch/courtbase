import { getCurrentStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { RES_STATUS, fmtDateTime, jstDateKey } from "@/lib/format";
import { FORMAT_LABEL, categoryLabel } from "@/lib/entry";

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** 大会のエントリー一覧CSV */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentStaff();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const slot = await db.slot.findUnique({
    where: { id },
    include: {
      categories: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      reservations: { where: { status: { not: "CANCELED" } }, include: { member: true, category: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!slot) return new Response("Not found", { status: 404 });
  const order = new Map(slot.categories.map((c, i) => [c.id, i]));
  const list = [...slot.reservations].sort((a, b) => (order.get(a.categoryId ?? "") ?? 999) - (order.get(b.categoryId ?? "") ?? 999));
  const max = Math.max(1, ...list.map((r) => r.players.length));
  const rows = [
    ["種目", "形式", "チーム名", ...Array.from({ length: max }, (_, i) => (i === 0 ? "代表者（選手1）" : `選手${i + 1}`)), "代表者 会員番号", "電話", "メール", "LINE連携", "状態", "申込日時"],
    ...list.map((r) => [
      r.category ? categoryLabel(r.category) : "",
      r.category ? FORMAT_LABEL[r.category.format] : "",
      r.teamName ?? "",
      ...Array.from({ length: max }, (_, i) => r.players[i] ?? (i === 0 ? `${r.member.lastName} ${r.member.firstName}` : "")),
      r.member.memberNo,
      r.member.phone,
      r.member.email,
      r.member.lineUserId ? "あり" : "なし",
      RES_STATUS[r.status],
      fmtDateTime(r.createdAt),
    ]),
  ];
  await audit(me.id, "event.entries_export", id);
  const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`entries_${jstDateKey(slot.startsAt)}.csv`)}`,
    },
  });
}
