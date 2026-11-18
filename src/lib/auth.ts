import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Role, Staff } from "@prisma/client";
import { db } from "./db";
import { newToken, sha256 } from "./tokens";
import { clientInfo } from "./request";

export const SESSION_COOKIE = "cb_session";

export async function createSession(staffId: string) {
  const setting = await db.setting.findUnique({ where: { id: 1 } });
  const hours = setting?.sessionHours ?? 12;
  const token = newToken();
  const expiresAt = new Date(Date.now() + hours * 3600_000);
  const { ip, userAgent } = await clientInfo();
  await db.session.create({ data: { id: sha256(token), staffId, expiresAt, ip, userAgent } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export type SessionStaff = Pick<Staff, "id" | "name" | "email" | "role" | "mustChangePassword"> & { sessionId: string };

export const getCurrentStaff = cache(async (): Promise<SessionStaff | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: sha256(token) },
    include: { staff: { select: { id: true, name: true, email: true, role: true, mustChangePassword: true, active: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.staff.active) return null;
  const { active: _a, ...staff } = session.staff;
  return { ...staff, sessionId: session.id };
});

/** 画面・アクションの先頭で呼ぶ。未ログインならログイン画面へ、権限不足なら403相当 */
export async function requireStaff(roles?: Role[]): Promise<SessionStaff> {
  const staff = await getCurrentStaff();
  if (!staff) {
    const path = (await headers()).get("x-pathname") ?? "/dashboard";
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  if (staff.mustChangePassword) {
    const path = (await headers()).get("x-pathname");
    if (path !== "/password") redirect("/password");
  }
  if (roles && !roles.includes(staff.role)) redirect("/forbidden");
  return staff;
}

export const ROLE_LABEL: Record<Role, string> = { OWNER: "オーナー", ADMIN: "管理者", STAFF: "スタッフ" };
export const canManage = (role: Role) => role === "OWNER" || role === "ADMIN";
