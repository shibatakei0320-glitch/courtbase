import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";

const cell = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const GENDER: Record<string, string> = { male: "男", female: "女", other: "その他" };

/** 協会に提出するエントリー一覧（Excel対応BOM付きCSV） */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const t = await db.tournament.findUnique({
    where: { id },
    include: { entries: { where: { status: { not: "CANCELED" } }, include: { member: true }, orderBy: [{ category: "asc" }, { createdAt: "asc" }] } },
  });
  if (!t) return new NextResponse("not found", { status: 404 });
  const rows = [
    ["種目", "氏名", "フリガナ", "性別", "生年月日", "登録団体", "登録番号", "ペア", "電話", "参加費", "状態", "メモ"],
    ...t.entries.map((e) => [
      e.category,
      `${e.member.lastName} ${e.member.firstName}`,
      `${e.member.lastKana ?? ""} ${e.member.firstKana ?? ""}`.trim(),
      GENDER[e.member.gender ?? ""] ?? "",
      e.member.birthDate ? fmtDate(e.member.birthDate) : "",
      e.member.associationName ?? "",
      e.member.associationNo ?? "",
      e.partner ?? "",
      e.member.phone ?? "",
      e.paymentId ? "受領済" : t.fee > 0 ? "未収" : "",
      e.status === "SUBMITTED" ? "提出済" : "申込",
      e.note ?? "",
    ]),
  ];
  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="entries-${id}.csv"` } });
}
