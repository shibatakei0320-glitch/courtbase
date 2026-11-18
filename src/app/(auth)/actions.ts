"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession, getCurrentStaff } from "@/lib/auth";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/password";
import { newToken, sha256 } from "@/lib/tokens";
import { sendMail } from "@/lib/mail";
import { audit } from "@/lib/audit";
import { appUrl } from "@/lib/url";
import { str, type ActionState } from "@/lib/action";

const MAX_FAILS = 5;
const LOCK_MIN = 15;
// ユーザー列挙対策: 存在しないメール時も同程度の時間をかける
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword("dummy-password-0"));

function safeNext(next: string) {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!email || !password) return { error: "メールアドレスとパスワードを入力してください" };

  const staff = await db.staff.findUnique({ where: { email } });
  if (!staff || !staff.active) {
    await verifyPassword(password, await getDummyHash());
    return { error: "メールアドレスまたはパスワードが正しくありません" };
  }
  if (staff.lockedUntil && staff.lockedUntil > new Date()) {
    return { error: `ログイン試行回数が上限に達しました。しばらく時間をおいて再度お試しください` };
  }
  if (!(await verifyPassword(password, staff.passwordHash))) {
    const fails = staff.failedLoginCount + 1;
    const locked = fails >= MAX_FAILS;
    await db.staff.update({
      where: { id: staff.id },
      data: { failedLoginCount: locked ? 0 : fails, lockedUntil: locked ? new Date(Date.now() + LOCK_MIN * 60_000) : null },
    });
    await audit(staff.id, locked ? "login.locked" : "login.failed", staff.email);
    return { error: "メールアドレスまたはパスワードが正しくありません" };
  }
  await db.staff.update({ where: { id: staff.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await createSession(staff.id);
  await audit(staff.id, "login.success", staff.email);
  redirect(staff.mustChangePassword ? "/password" : safeNext(str(fd, "next")));
}

export async function logout() {
  const me = await getCurrentStaff();
  if (me) await audit(me.id, "logout");
  await destroySession();
  redirect("/login");
}

export async function requestReset(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email").toLowerCase();
  if (!email) return { error: "メールアドレスを入力してください" };
  const staff = await db.staff.findUnique({ where: { email } });
  if (staff?.active) {
    const token = newToken();
    await db.passwordResetToken.deleteMany({ where: { staffId: staff.id, usedAt: null } });
    await db.passwordResetToken.create({
      data: { staffId: staff.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60_000) },
    });
    const url = `${appUrl()}/reset-password/${token}`;
    await sendMail(
      staff.email,
      "【CourtBase】パスワード再設定のご案内",
      `${staff.name} 様\n\n以下のURLから1時間以内にパスワードを再設定してください。\n${url}\n\nお心当たりがない場合はこのメールを破棄してください。`,
    );
    await audit(staff.id, "password.reset_requested", staff.email);
  }
  return { ok: "入力されたメールアドレスが登録されている場合、再設定用のメールを送信しました。" };
}

export async function resetPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const token = str(fd, "token");
  const pw = str(fd, "password");
  if (pw !== str(fd, "confirm")) return { error: "確認用パスワードが一致しません" };
  const err = validatePassword(pw);
  if (err) return { error: err };
  const rec = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!rec || rec.usedAt || rec.expiresAt < new Date()) return { error: "このURLは無効か期限切れです。もう一度再設定をお申し込みください" };
  await db.$transaction([
    db.staff.update({
      where: { id: rec.staffId },
      data: { passwordHash: await hashPassword(pw), passwordChangedAt: new Date(), mustChangePassword: false, failedLoginCount: 0, lockedUntil: null },
    }),
    db.passwordResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
    db.session.deleteMany({ where: { staffId: rec.staffId } }),
  ]);
  await audit(rec.staffId, "password.reset");
  redirect("/login?reset=1");
}

export async function changePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentStaff();
  if (!me) redirect("/login");
  const current = str(fd, "current");
  const pw = str(fd, "password");
  if (pw !== str(fd, "confirm")) return { error: "確認用パスワードが一致しません" };
  const err = validatePassword(pw);
  if (err) return { error: err };
  const staff = await db.staff.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await verifyPassword(current, staff.passwordHash))) return { error: "現在のパスワードが正しくありません" };
  if (current === pw) return { error: "新しいパスワードは現在のものと異なるものにしてください" };
  await db.$transaction([
    db.staff.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(pw), passwordChangedAt: new Date(), mustChangePassword: false } }),
    // 他端末のセッションを無効化
    db.session.deleteMany({ where: { staffId: me.id, NOT: { id: me.sessionId } } }),
  ]);
  await audit(me.id, "password.changed");
  return { ok: "パスワードを変更しました。他の端末のログインは解除されました。" };
}
