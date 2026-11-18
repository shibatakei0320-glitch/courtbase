import "server-only";

/** LINE公式アカウント（Messaging API）からプッシュ送信。トークン未設定なら何もしない */
export const lineMessagingConfigured = () => Boolean(process.env.LINE_MESSAGING_TOKEN);

export async function pushLine(to: string | null | undefined, text: string): Promise<boolean> {
  const token = process.env.LINE_MESSAGING_TOKEN;
  if (!token || !to) return false;
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
    });
    if (!res.ok) console.error("[line push]", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("[line push]", e);
    return false;
  }
}
