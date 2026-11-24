"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type MemberStatus, type PaymentMethod } from "@prisma/client";
import { isBankKana, toBankKana } from "@/lib/zengin";
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
    ...profileData(fd),
  };
}

const kana = (fd: FormData, k: string) => (optStr(fd, k) ? toBankKana(str(fd, k)) : null);
const year = (fd: FormData, k: string) => (/^\d{4}$/.test(str(fd, k)) ? Number(str(fd, k)) : null);

/** 大会・緊急連絡先・健康・保険、月謝の払い方と口座（フォームにある項目だけ更新する） */
function profileData(fd: FormData) {
  const d: Record<string, unknown> = {};
  if (fd.has("associationNo")) Object.assign(d, { associationName: optStr(fd, "associationName"), associationNo: optStr(fd, "associationNo") });
  if (fd.has("emergencyName"))
    Object.assign(d, {
      emergencyName: optStr(fd, "emergencyName"),
      emergencyRelation: optStr(fd, "emergencyRelation"),
      emergencyPhone: optStr(fd, "emergencyPhone"),
      medicalNote: optStr(fd, "medicalNote"),
      insuranceYear: year(fd, "insuranceYear"),
      schoolName: optStr(fd, "schoolName"),
    });
  if (fd.has("tuitionMethod")) {
    const method = str(fd, "tuitionMethod") as PaymentMethod;
    Object.assign(d, {
      tuitionMethod: ["CASH", "TRANSFER", "DEBIT", "CARD", "OTHER"].includes(method) ? method : "CASH",
      bankCode: optStr(fd, "bankCode"),
      bankName: kana(fd, "bankName") ?? (str(fd, "bankCode") === "0170" ? "ﾔﾏｸﾞﾁ" : null),
      branchCode: optStr(fd, "branchCode"),
      branchName: kana(fd, "branchName"),
      accountType: str(fd, "accountType") === "2" ? 2 : str(fd, "accountType") === "1" ? 1 : null,
      accountNo: optStr(fd, "accountNo")?.replace(/\D/g, "") || null,
      accountHolder: kana(fd, "accountHolder"),
    });
  }
  return d as Partial<{ tuitionMethod: PaymentMethod; bankCode: string | null; bankName: string | null; branchCode: string | null; branchName: string | null; accountType: number | null; accountNo: string | null; accountHolder: string | null; associationName: string | null; associationNo: string | null; emergencyName: string | null; emergencyRelation: string | null; emergencyPhone: string | null; medicalNote: string | null; insuranceYear: number | null; schoolName: string | null }>;
}

function check(d: ReturnType<typeof memberData>): string | null {
  if (!d.lastName || !d.firstName) return "氏名（姓・名）を入力してください";
  if (d.accountHolder && !isBankKana(d.accountHolder)) return "預金者名はカナで入力してください（漢字は使えません）";
  if (d.bankCode && !/^\d{4}$/.test(d.bankCode)) return "金融機関コードは4桁の数字です（山口銀行は0170）";
  if (d.branchCode && !/^\d{3}$/.test(d.branchCode)) return "支店コードは3桁の数字です";
  if (d.accountNo && !/^\d{1,7}$/.test(d.accountNo)) return "口座番号は7桁までの数字です";
  if (d.tuitionMethod === "DEBIT" && (!d.bankCode || !d.branchCode || !d.accountNo || !d.accountHolder)) return "口座振替にする場合は、口座の情報をすべて入力してください";
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
    const guardianId = optStr(fd, "guardianId");
    if (guardianId && !(await db.member.findFirst({ where: { id: guardianId, guardianId: null } }))) return { error: "保護者が見つかりません" };
    id = (await db.member.create({ data: { ...d, guardianId } })).id;
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

/** 保護者の設定・解除（1階層のみ：保護者は子どもを持つ会員で、自身に保護者はいない） */
export async function setGuardian(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const id = str(fd, "id");
  const guardianId = optStr(fd, "guardianId");
  const m = await db.member.findUnique({ where: { id }, include: { _count: { select: { children: true } } } });
  if (!m) return { error: "会員が見つかりません" };
  if (guardianId) {
    if (guardianId === id) return { error: "自分自身は保護者にできません" };
    if (m._count.children > 0) return { error: "お子さまが登録されている会員は、ほかの会員の子どもにできません" };
    const g = await db.member.findUnique({ where: { id: guardianId } });
    if (!g) return { error: "保護者が見つかりません" };
    if (g.guardianId) return { error: "保護者に指定した会員は、ほかの会員の子どもとして登録されています" };
  }
  await db.member.update({ where: { id }, data: { guardianId } });
  await audit(me.id, guardianId ? "member.guardian_set" : "member.guardian_unset", id, guardianId ?? undefined);
  revalidatePath(`/members/${id}`);
  if (guardianId) revalidatePath(`/members/${guardianId}`);
  return { ok: guardianId ? "保護者を設定しました。保護者のLINE・会員ページから欠席連絡・振替ができます" : "保護者の設定を外しました" };
}
