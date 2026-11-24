import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { buildDebitFile } from "@/lib/debit";
import { isMonth } from "@/lib/tuition";

/** 口座振替の依頼データ（全銀協フォーマット・Shift_JIS）をダウンロード */
export async function GET(req: Request) {
  const me = await requireStaff(["OWNER", "ADMIN"]);
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!isMonth(month)) return new NextResponse("month を指定してください", { status: 400 });
  try {
    const f = await buildDebitFile(month);
    await audit(me.id, "tuition.debit_file", month, `${f.count}件 ${f.total}円`);
    return new NextResponse(Buffer.from(f.bytes), {
      headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="furikae-${month}.txt"` },
    });
  } catch (e) {
    return new NextResponse(`口座振替データを作成できませんでした：${(e as Error).message}`, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
