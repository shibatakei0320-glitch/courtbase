import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";

/*
 * LINE公式アカウント（Messaging API）
 * - 送ったメッセージ（通知・自動応答・スタッフの返信）は、すべて受信箱の会話履歴に残す
 * - LINE_MESSAGING_TOKEN（チャネルアクセストークン）未設定なら送信しない
 * - LINE_MESSAGING_SECRET（チャネルシークレット）は Webhook の署名検証に使う
 */
export const lineMessagingConfigured = () => Boolean(process.env.LINE_MESSAGING_TOKEN);
export const lineWebhookConfigured = () => Boolean(process.env.LINE_MESSAGING_TOKEN && process.env.LINE_MESSAGING_SECRET);

export type LineMsg = Record<string, unknown> & { type: string };

/** Webhook の X-Line-Signature を検証 */
export function verifyLineSignature(body: string, signature: string | null): boolean {
  const secret = process.env.LINE_MESSAGING_SECRET;
  if (!secret || !signature) return false;
  const mac = createHmac("sha256", secret).update(body).digest();
  const sig = Buffer.from(signature, "base64");
  return sig.length === mac.length && timingSafeEqual(sig, mac);
}

/** 相手（友だち）の取得・作成。初回はプロフィール（表示名・アイコン）を取りに行く */
export async function upsertContact(lineUserId: string) {
  const c = await db.lineContact.upsert({ where: { lineUserId }, create: { lineUserId }, update: {} });
  if (!c.displayName && process.env.LINE_MESSAGING_TOKEN) {
    try {
      const res = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`, {
        headers: { Authorization: `Bearer ${process.env.LINE_MESSAGING_TOKEN}` },
      });
      if (res.ok) {
        const p = (await res.json()) as { displayName?: string; pictureUrl?: string };
        return db.lineContact.update({ where: { id: c.id }, data: { displayName: p.displayName ?? null, pictureUrl: p.pictureUrl ?? null } });
      }
    } catch (e) {
      console.error("[line profile]", e);
    }
  }
  return c;
}

/** 会話履歴に記録する */
export async function recordLine(
  lineUserId: string,
  m: { direction: "IN" | "OUT"; type: string; text: string; auto?: boolean; staffId?: string | null; lineMessageId?: string | null; needsReply?: boolean },
) {
  const c = await upsertContact(lineUserId);
  if (m.lineMessageId && (await db.lineMessage.findUnique({ where: { lineMessageId: m.lineMessageId } }))) return c; // 再送の重複
  await db.lineMessage.create({
    data: { contactId: c.id, direction: m.direction, type: m.type, text: m.text.slice(0, 5000), auto: m.auto ?? false, staffId: m.staffId ?? null, lineMessageId: m.lineMessageId ?? null },
  });
  await db.lineContact.update({
    where: { id: c.id },
    data: {
      lastMessageAt: new Date(),
      lastText: m.text.slice(0, 120),
      ...(m.direction === "IN" && m.needsReply ? { unread: { increment: 1 }, needsReply: true } : {}),
      ...(m.direction === "OUT" && m.staffId ? { unread: 0, needsReply: false } : {}),
    },
  });
  return c;
}

/** メッセージの要約（履歴に残す文面） */
export function summarize(messages: LineMsg[]): string {
  return messages
    .map((m) => {
      if (m.type === "text") return String(m.text);
      if (m.type === "template") return String((m as { altText?: string }).altText ?? "[テンプレート]");
      if (m.type === "flex") return String((m as { altText?: string }).altText ?? "[メッセージ]");
      return `[${m.type}]`;
    })
    .join("\n");
}

async function callLine(path: string, payload: object): Promise<boolean> {
  const token = process.env.LINE_MESSAGING_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`https://api.line.me/v2/bot/message/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error(`[line ${path}]`, res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error(`[line ${path}]`, e);
    return false;
  }
}

/** プッシュ送信（通知・スタッフの返信） */
export async function pushMessages(to: string | null | undefined, messages: LineMsg[], opts: { staffId?: string | null; auto?: boolean } = {}): Promise<boolean> {
  if (!to || !messages.length) return false;
  const ok = await callLine("push", { to, messages: messages.slice(0, 5) });
  if (ok) await recordLine(to, { direction: "OUT", type: "text", text: summarize(messages), auto: opts.auto ?? !opts.staffId, staffId: opts.staffId });
  return ok;
}

export async function pushLine(to: string | null | undefined, text: string, opts: { staffId?: string | null } = {}): Promise<boolean> {
  return pushMessages(to, [{ type: "text", text: text.slice(0, 4900) }], opts);
}

/** 応答メッセージ（Webhook のイベントへの返信。無料枠を消費しない） */
export async function replyMessages(replyToken: string, to: string, messages: LineMsg[]): Promise<boolean> {
  if (!messages.length) return false;
  const ok = await callLine("reply", { replyToken, messages: messages.slice(0, 5) });
  if (ok) await recordLine(to, { direction: "OUT", type: "text", text: summarize(messages), auto: true });
  return ok;
}
