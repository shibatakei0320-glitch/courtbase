import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { isMonth, type Line } from "@/lib/tuition";

const STATUS = { UNPAID: "未入金", PAID: "入金済", VOID: "取消" } as const;
const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/** 月謝の請求一覧CSV（Excel対応BOM付き。口座振替の依頼データ作成などに） */
export async function GET(req: Request) {
  await requireStaff(["OWNER", "ADMIN"]);
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!isMonth(month)) return new NextResponse("month を指定してください", { status: 400 });
  const list = await db.invoice.findMany({ where: { month }, include: { member: true }, orderBy: { member: { memberNo: "asc" } } });
  const rows = [
    ["会員番号", "氏名", "フリガナ", "電話", "メール", "対象月", "金額", "明細", "状態", "入金日"],
    ...list.map((i) => [
      String(i.member.memberNo).padStart(6, "0"),
      `${i.member.lastName} ${i.member.firstName}`,
      `${i.member.lastKana ?? ""} ${i.member.firstKana ?? ""}`.trim(),
      i.member.phone ?? "",
      i.member.email ?? "",
      i.month,
      i.amount,
      (i.lines as Line[]).map((l) => `${l.label} ${l.amount}`).join(" / "),
      STATUS[i.status],
      i.paidAt ? i.paidAt.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }) : "",
    ]),
  ];
  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="tuition-${month}.csv"` } });
}
