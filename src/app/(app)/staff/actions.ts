"use server";
import { revalidatePath } from "next/cache";
import { randomInt } from "crypto";
import { Prisma, type Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStaff, type SessionStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";
import { bool, str, type ActionState } from "@/lib/action";

const ROLES: Role[] = ["OWNER", "ADMIN", "STAFF"];

function tempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = chars + digits;
  let s = chars[randomInt(chars.length)] + digits[randomInt(digits.length)];
  for (let i = 0; i < 10; i++) s += all[randomInt(all.length)];
  return s;
}

/** OWNERの付与・OWNERへの操作はOWNERのみ */
function guard(me: SessionStaff, targetRole: Role | null, newRole?: Role): string | null {
  if (me.role !== "OWNER" && (targetRole === "OWNER" || newRole === "OWNER")) return "オーナー権限の操作はオーナーのみ可能です";
  return null;
}

async function ownersLeftAfter(excludeId: string) {
  return db.staff.count({ where: { role: "OWNER", active: true, NOT: { id: excludeId } } });
}

export async function createStaff(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff(["OWNER", "ADMIN"]);
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const role = str(fd, "role") as Role;
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "氏名と正しいメールアドレスを入力してください" };
  if (!ROLES.includes(role)) return { error: "権限が不正です" };
  const g = guard(me, null, role);
  if (g) return { error: g };
  const pw = tempPassword();
  try {
    await db.staff.create({ data: { name, email, role, passwordHash: await hashPassword(pw), mustChangePassword: true } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "このメールアドレスは既に登録されています" };
    throw e;
  }
  await audit(me.id, "staff.create", email, role);
  revalidatePath("/staff");
  return { ok: `スタッフを登録しました。仮パスワード: ${pw} （この画面を閉じると再表示できません。初回ログイン時に変更が求められます）` };
}

export async function updateStaff(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff(["OWNER", "ADMIN"]);
  const id = str(fd, "id");
  const target = await db.staff.findUniqueOrThrow({ where: { id } });
  const role = str(fd, "role") as Role;
  const active = bool(fd, "active");
  if (!ROLES.includes(role)) return { error: "権限が不正です" };
  const g = guard(me, target.role, role);
  if (g) return { error: g };
  if (id === me.id && (!active || role !== me.role)) return { error: "自分自身の権限変更・無効化はできません" };
  if (target.role === "OWNER" && (role !== "OWNER" || !active) && (await ownersLeftAfter(id)) === 0) return { error: "有効なオーナーが最低1名必要です" };
  await db.$transaction([
    db.staff.update({ where: { id }, data: { name: str(fd, "name") || target.name, role, active } }),
    ...(active ? [] : [db.session.deleteMany({ where: { staffId: id } })]),
  ]);
  await audit(me.id, "staff.update", target.email, `${role} ${active ? "有効" : "無効"}`);
  revalidatePath("/staff");
  return { ok: "更新しました" };
}

export async function resetStaffPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff(["OWNER", "ADMIN"]);
  const id = str(fd, "id");
  const target = await db.staff.findUniqueOrThrow({ where: { id } });
  const g = guard(me, target.role);
  if (g) return { error: g };
  if (id === me.id) return { error: "自分のパスワードは「パスワード変更」画面から変更してください" };
  const pw = tempPassword();
  await db.$transaction([
    db.staff.update({ where: { id }, data: { passwordHash: await hashPassword(pw), mustChangePassword: true, failedLoginCount: 0, lockedUntil: null } }),
    db.session.deleteMany({ where: { staffId: id } }),
  ]);
  await audit(me.id, "staff.password_reset", target.email);
  return { ok: `仮パスワードを発行しました: ${pw}` };
}

export async function forceLogout(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff(["OWNER", "ADMIN"]);
  const id = str(fd, "id");
  const target = await db.staff.findUniqueOrThrow({ where: { id } });
  const g = guard(me, target.role);
  if (g) return { error: g };
  const { count } = await db.session.deleteMany({ where: { staffId: id, NOT: { id: me.sessionId } } });
  await audit(me.id, "staff.force_logout", target.email);
  revalidatePath("/staff");
  return { ok: `${count}件のセッションを無効化しました` };
}
