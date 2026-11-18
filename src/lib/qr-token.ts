import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

// 会員証QRの中身: "PL1.<会員ID>.<署名>"。署名で改ざん・なりすましを防ぐ
function secret() {
  const s = process.env.QR_SECRET || process.env.LINE_CHANNEL_SECRET || process.env.DATABASE_URL;
  if (!s) throw new Error("QR署名用のシークレットがありません");
  return s;
}
const mac = (id: string) => createHmac("sha256", secret()).update(`member-card:${id}`).digest("base64url").slice(0, 22);

export const memberQrValue = (memberId: string) => `PL1.${memberId}.${mac(memberId)}`;

export function parseMemberQr(value: string): string | null {
  const [v, id, sig] = value.trim().split(".");
  if (v !== "PL1" || !id || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(mac(id));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}
