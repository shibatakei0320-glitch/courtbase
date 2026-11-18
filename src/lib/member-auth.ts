import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "./db";
import { newToken, sha256 } from "./tokens";

export const MEMBER_COOKIE = "pl_member";
/** LINEログイン済み・会員未登録のユーザーを登録画面まで運ぶための署名付きCookie */
export const LINE_PENDING_COOKIE = "pl_line_pending";
const SESSION_DAYS = 30;

const secure = process.env.NODE_ENV === "production";

type CookieOpts = { httpOnly: boolean; sameSite: "lax"; secure: boolean; path: string; expires: Date };
type CookieSetter = { set(name: string, value: string, opts: CookieOpts): unknown };

/** 会員セッションを作成。route handler では res.cookies を渡す */
export async function createMemberSession(memberId: string, jar?: CookieSetter) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.memberSession.create({ data: { id: sha256(token), memberId, expiresAt } });
  (jar ?? (await cookies())).set(MEMBER_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", expires: expiresAt });
}

export async function destroyMemberSession() {
  const jar = await cookies();
  const token = jar.get(MEMBER_COOKIE)?.value;
  if (token) await db.memberSession.deleteMany({ where: { id: sha256(token) } });
  jar.delete(MEMBER_COOKIE);
}

export const getCurrentMember = cache(async () => {
  const token = (await cookies()).get(MEMBER_COOKIE)?.value;
  if (!token) return null;
  const s = await db.memberSession.findUnique({ where: { id: sha256(token) }, include: { member: true } });
  if (!s || s.expiresAt < new Date() || s.member.status === "WITHDRAWN") return null;
  return s.member;
});

export async function requireMember() {
  const m = await getCurrentMember();
  if (!m) redirect("/my/login");
  return m;
}

// ---- 署名付き値（LINE未登録ユーザーの一時保持用） ----
function key() {
  const k = process.env.LINE_CHANNEL_SECRET;
  if (!k) throw new Error("LINE_CHANNEL_SECRET が未設定です");
  return k;
}
export function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${mac}`;
}
export function unsign<T>(value: string | undefined): T | null {
  if (!value) return null;
  const [body, mac] = value.split(".");
  if (!body || !mac) return null;
  const expect = createHmac("sha256", key()).update(body).digest("base64url");
  const a = Buffer.from(mac), b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp?: number };
    if (data.exp && data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export type LinePending = { sub: string; name?: string; exp: number };
export async function getLinePending() {
  return unsign<LinePending>((await cookies()).get(LINE_PENDING_COOKIE)?.value);
}
