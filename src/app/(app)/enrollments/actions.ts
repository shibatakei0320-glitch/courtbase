"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { optStr, str, type ActionState } from "@/lib/action";
import { fromJst } from "@/lib/format";
import { enrolledCount, expireCreditsAfter, syncClassReservations, todayKey } from "@/lib/school";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function refresh(memberId?: string) {
  revalidatePath("/enrollments");
  revalidatePath("/classes", "layout");
  if (memberId) revalidatePath(`/members/${memberId}`);
}

/** クラスとプランの組み合わせを確かめる（フリーはクラスなし、それ以外はクラス必須） */
async function resolve(classId: string | null, planId: string | null) {
  const [c, p] = await Promise.all([classId ? db.schoolClass.findUnique({ where: { id: classId } }) : null, planId ? db.plan.findUnique({ where: { id: planId } }) : null]);
  if (classId && !c) return { error: "クラスが見つかりません" } as const;
  if (planId && !p) return { error: "受講プランが見つかりません" } as const;
  const free = p?.freeMax != null;
  if (free && c) return { error: "フリーコースはクラスを選ばずに登録します（クラスを「なし」にしてください）" } as const;
  if (!free && !c) return { error: "クラスを選んでください（フリーコースは受講プランでフリーを選びます）" } as const;
  if (c && p?.target && p.target !== c.target) return { error: `受講プラン「${p.name}」は、このクラス（${c.target === "JUNIOR" ? "ジュニア" : "成人"}）では使えません` } as const;
  return { c, p, planId: planId ?? c?.planId ?? null } as const;
}

/** 在籍台帳への直接入力：会員（新規 or 既存）をクラス・受講プランに登録 */
export async function addDirect(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const lastName = str(fd, "lastName");
  const firstName = str(fd, "firstName");
  const memberId = optStr(fd, "memberId");
  if (!memberId && (!lastName || !firstName)) return { error: "氏名（姓・名）を入力するか、既存の会員を選んでください" };
  const start = str(fd, "startDate") || todayKey();
  if (!DATE.test(start)) return { error: "開始日を正しく入力してください" };
  const r = await resolve(optStr(fd, "classId"), optStr(fd, "planId"));
  if ("error" in r) return { error: r.error };
  const startDate = fromJst(start);
  if (r.c && (await enrolledCount(r.c.id, startDate)) >= r.c.capacity) return { error: `「${r.c.name}」は定員（${r.c.capacity}名）に達しています` };

  let member = memberId ? await db.member.findUnique({ where: { id: memberId } }) : await db.member.findFirst({ where: { lastName, firstName, status: { not: "WITHDRAWN" } } });
  let created = false;
  if (!member) {
    const birth = str(fd, "birthDate");
    member = await db.member.create({
      data: {
        lastName,
        firstName,
        lastKana: optStr(fd, "lastKana"),
        firstKana: optStr(fd, "firstKana"),
        phone: optStr(fd, "phone"),
        birthDate: DATE.test(birth) ? fromJst(birth) : null,
        tuitionMethod: (["CASH", "TRANSFER", "DEBIT"].includes(str(fd, "tuitionMethod")) ? str(fd, "tuitionMethod") : "CASH") as "CASH" | "TRANSFER" | "DEBIT",
        note: "在籍台帳から登録",
      },
    });
    created = true;
  }
  const dup = await db.enrollment.findFirst({ where: { memberId: member.id, classId: r.c?.id ?? null, planId: r.planId, OR: [{ endDate: null }, { endDate: { gte: startDate } }] } });
  if (dup) return { error: `${member.lastName} ${member.firstName}さんは、すでに同じ在籍があります` };
  await db.enrollment.create({ data: { memberId: member.id, classId: r.c?.id ?? null, planId: r.planId, startDate } });
  if (r.c) await syncClassReservations(r.c.id, member.id);
  await audit(me.id, "enrollment.add", member.id, `${r.c?.name ?? r.p?.name ?? ""} ${start}〜`);
  refresh(member.id);
  return { ok: `${member.lastName} ${member.firstName}さん${created ? "（新しい会員）" : ""}を「${r.c?.name ?? r.p?.name}」に登録しました` };
}

/** 在籍の修正（クラス・受講プラン・開始日・最終日） */
export async function updateEnrollment(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const e = await db.enrollment.findUnique({ where: { id: str(fd, "id") } });
  if (!e) return { error: "在籍が見つかりません" };
  const start = str(fd, "startDate");
  const end = str(fd, "endDate");
  if (!DATE.test(start)) return { error: "開始日を入力してください" };
  if (end && !DATE.test(end)) return { error: "最終日を正しく入力してください" };
  if (end && end < start) return { error: "最終日は開始日より後にしてください" };
  const r = await resolve(optStr(fd, "classId"), optStr(fd, "planId"));
  if ("error" in r) return { error: r.error };
  if (r.c && r.c.id !== e.classId && (await enrolledCount(r.c.id, fromJst(start))) >= r.c.capacity) return { error: `「${r.c.name}」は定員（${r.c.capacity}名）に達しています` };
  await db.enrollment.update({ where: { id: e.id }, data: { classId: r.c?.id ?? null, planId: r.planId, startDate: fromJst(start), endDate: end ? fromJst(end) : null } });
  for (const id of new Set([e.classId, r.c?.id].filter((x): x is string => !!x))) await syncClassReservations(id, e.memberId);
  if (end) await expireCreditsAfter(e.memberId);
  await audit(me.id, "enrollment.update", e.id, `${r.c?.name ?? r.p?.name ?? ""} ${start}〜${end}`);
  refresh(e.memberId);
  return { ok: "保存しました" };
}

/** 在籍の削除（入力の間違いなど。これから先の出席予定も消える） */
export async function deleteEnrollment(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const e = await db.enrollment.findUnique({ where: { id: str(fd, "id") } });
  if (!e) return { error: "在籍が見つかりません" };
  await db.enrollment.delete({ where: { id: e.id } });
  if (e.classId) await syncClassReservations(e.classId, e.memberId);
  await audit(me.id, "enrollment.delete", e.id);
  refresh(e.memberId);
  return { ok: "在籍を削除しました" };
}

/** 在籍台帳をすべて消去（オーナーのみ）。これから先の出席予定も消える。会員の取り込みからやり直す場合は会員・月謝の記録も */
export async function clearAll(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff(["OWNER"]);
  if (str(fd, "confirm") !== "消去") return { error: "確認のため「消去」と入力してください" };
  const now = new Date();
  const [enr, res] = await db.$transaction([
    db.enrollment.deleteMany({}),
    db.reservation.deleteMany({ where: { kind: "REGULAR", status: "RESERVED", slot: { startsAt: { gt: now } } } }),
  ]);
  let members = 0;
  if (fd.get("imported") === "on") {
    const ids = (await db.member.findMany({ where: { note: { contains: "会費管理表" } }, select: { id: true } })).map((m) => m.id);
    await db.$transaction([
      db.invoice.deleteMany({ where: { memberId: { in: ids } } }),
      db.payment.deleteMany({ where: { memberId: { in: ids }, description: { contains: "会費管理表" } } }),
      db.member.deleteMany({ where: { id: { in: ids } } }),
    ]);
    members = ids.length;
  }
  await audit(me.id, "enrollment.clear_all", undefined, `在籍${enr.count} 出席予定${res.count} 会員${members}`);
  refresh();
  return { ok: `在籍台帳を消去しました（在籍 ${enr.count}件・これから先の出席予定 ${res.count}件${members ? `・取り込んだ会員 ${members}名と月謝の記録` : ""}）` };
}
