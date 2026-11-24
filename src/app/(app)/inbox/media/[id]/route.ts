import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";

/** 受信した画像・ファイルをLINEから取得して表示（LINE側の保存期間内のみ） */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const m = await db.lineMessage.findUnique({ where: { id } });
  const token = process.env.LINE_MESSAGING_TOKEN;
  if (!m?.lineMessageId || !token) return new NextResponse("not found", { status: 404 });
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${m.lineMessageId}/content`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return new NextResponse("LINEの保存期間を過ぎたか、取得できませんでした", { status: 404 });
  return new NextResponse(res.body, {
    headers: { "Content-Type": res.headers.get("content-type") ?? "application/octet-stream", "Cache-Control": "private, max-age=3600" },
  });
}
