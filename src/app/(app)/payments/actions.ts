"use server";
import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { canManage, requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { bool, int, optStr, str, type ActionState } from "@/lib/action";
import { fromJst } from "@/lib/format";

export async function createPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const amount = int(fd, "amount");
  if (amount === 0) return { error: "金額を入力してください（返金はマイナス）" };
  const method = str(fd, "method") as PaymentMethod;
  if (!["CASH", "CARD", "TRANSFER", "OTHER"].includes(method)) return { error: "支払方法が不正です" };
  const memberId = optStr(fd, "memberId");
  const planId = optStr(fd, "planId");
  const plan = planId ? await db.plan.findUnique({ where: { id: planId } }) : null;
  const description = str(fd, "description") || plan?.name;
  if (!description) return { error: "内容を入力してください" };
  const date = optStr(fd, "paidAt");
  const grant = bool(fd, "grantTickets") && plan?.kind === "TICKET" && memberId;
  await db.$transaction(async (tx) => {
    await tx.payment.create({ data: { amount, method, description, memberId, planId, staffId: me.id, paidAt: date ? fromJst(date, "12:00") : new Date() } });
    if (grant && plan?.ticketCount) await tx.member.update({ where: { id: memberId }, data: { tickets: { increment: plan.ticketCount } } });
    if (memberId && plan && plan.kind === "MONTHLY") await tx.member.update({ where: { id: memberId }, data: { planId: plan.id } });
  });
  await audit(me.id, "payment.create", memberId ?? undefined, `${description} ${amount}`);
  revalidatePath("/payments");
  return { ok: `入金を登録しました${grant ? `（チケット${plan!.ticketCount}枚付与）` : ""}` };
}

export async function deletePayment(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  if (!canManage(me.role)) return { error: "削除は管理者のみ可能です" };
  const p = await db.payment.delete({ where: { id: str(fd, "id") } });
  await audit(me.id, "payment.delete", p.id, `${p.description} ${p.amount}`);
  revalidatePath("/payments");
  return { ok: "削除しました" };
}
