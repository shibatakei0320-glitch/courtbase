"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { hashPassword, validatePassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { str, type ActionState } from "@/lib/action";

/** 初回セットアップ: スタッフが0人のときだけ最初のオーナーを作成できる */
export async function setupOwner(_: ActionState, fd: FormData): Promise<ActionState> {
  const facilityName = str(fd, "facilityName") || "CourtBase";
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const pw = str(fd, "password");
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "氏名と正しいメールアドレスを入力してください" };
  if (pw !== str(fd, "confirm")) return { error: "確認用パスワードが一致しません" };
  const err = validatePassword(pw);
  if (err) return { error: err };
  const passwordHash = await hashPassword(pw);
  const owner = await db.$transaction(async (tx) => {
    await tx.$executeRaw`LOCK TABLE "Staff" IN EXCLUSIVE MODE`;
    if ((await tx.staff.count()) > 0) return null;
    await tx.setting.upsert({ where: { id: 1 }, update: { facilityName }, create: { id: 1, facilityName } });
    return tx.staff.create({ data: { name, email, passwordHash, role: "OWNER" } });
  });
  if (!owner) return { error: "セットアップは既に完了しています。ログイン画面からログインしてください" };
  await audit(owner.id, "setup.owner_created", email);
  await createSession(owner.id);
  redirect("/dashboard");
}
