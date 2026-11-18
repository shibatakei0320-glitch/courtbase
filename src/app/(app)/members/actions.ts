"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type MemberStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { int, optStr, str, type ActionState } from "@/lib/action";
import { fromJst } from "@/lib/format";

function memberData(fd: FormData) {
  const birth = optStr(fd, "birthDate");
  const status = str(fd, "status") as MemberStatus;
  return {
    lastName: str(fd, "lastName"),
    firstName: str(fd, "firstName"),
    lastKana: optStr(fd, "lastKana"),
    firstKana: optStr(fd, "firstKana"),
    email: optStr(fd, "email")?.toLowerCase() ?? null,
    phone: optStr(fd, "phone"),
    gender: optStr(fd, "gender"),
    birthDate: birth ? fromJst(birth) : null,
    planId: optStr(fd, "planId"),
    status: ["ACTIVE", "SUSPENDED", "WITHDRAWN"].includes(status) ? status : "ACTIVE",
    note: optStr(fd, "note"),
  };
}

function check(d: ReturnType<typeof memberData>): string | null {
  if (!d.lastName || !d.firstName) return "氏名（姓・名）を入力してください";
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return "メールアドレスの形式が正しくありません";
  return null;
}

const dupMsg = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" ? "このメールアドレスは既に登録されています" : null;

export async function createMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const d = memberData(fd);
  const err = check(d);
  if (err) return { error: err };
  let id: string;
  try {
    id = (await db.member.create({ data: d })).id;
  } catch (e) {
    const m = dupMsg(e);
    if (m) return { error: m };
    throw e;
  }
  await audit(me.id, "member.create", id, `${d.lastName} ${d.firstName}`);
  redirect(`/members/${id}`);
}

export async function updateMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const id = str(fd, "id");
  const d = memberData(fd);
  const err = check(d);
  if (err) return { error: err };
  try {
    await db.member.update({ where: { id }, data: d });
  } catch (e) {
    const m = dupMsg(e);
    if (m) return { error: m };
    throw e;
  }
  await audit(me.id, "member.update", id);
  revalidatePath(`/members/${id}`);
  return { ok: "会員情報を更新しました" };
}
