import { NextResponse } from "next/server";
import { verifyLineSignature } from "@/lib/line-message";
import { handleEvent } from "@/lib/line-bot";

export const dynamic = "force-dynamic";

/** LINE公式アカウント（Messaging API）の Webhook。LINE Developers の Webhook URL に設定する */
export async function POST(req: Request) {
  const body = await req.text();
  if (!verifyLineSignature(body, req.headers.get("x-line-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const { events = [] } = JSON.parse(body) as { events?: Parameters<typeof handleEvent>[0][] };
  for (const ev of events) {
    try {
      await handleEvent(ev);
    } catch (e) {
      // 1件の失敗で他のイベントを落とさない（LINEは失敗すると再送しないため、ログに残す）
      console.error("[line webhook]", ev.type, e);
    }
  }
  return NextResponse.json({ ok: true });
}
