"use server";
import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { str, type ActionState } from "@/lib/action";
import { generateInvoices, isMonth, monthLabel } from "@/lib/tuition";

const METHODS: PaymentMethod[] = ["CASH", "CARD", "TRANSFER", "OTHER"];

export async function generate(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff(["OWNER", "ADMIN"]);
  const month = str(fd, "month");
  if (!isMonth(month)) return { error: "月を選んでください" };
  const r = await generateInvoices(month);
  await audit(me.id, "tuition.generate", month, JSON.stringify(r));
  revalidatePath("/tuition");
  return { ok: `${monthLabel(month)}の月謝：新規${r.created}件・更新${r.updated}件${r.removed ? `・削除${r.removed}件` : ""}${r.locked ? `（入金済み・取消の${r.locked}件はそのまま）` : ""}` };
}

async function pay(invoiceId: string, method: PaymentMethod, staffId: string) {
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv || inv.status !== "UNPAID") return false;
    const p = await tx.payment.create({ data: { memberId: inv.memberId, amount: inv.amount, method, description: `月謝 ${monthLabel(inv.month)}`, staffId } });
    const { count } = await tx.invoice.updateMany({ where: { id: inv.id, status: "UNPAID" }, data: { status: "PAID", paidAt: new Date(), paymentId: p.id } });
    if (!count) throw new Error("conflict");
    return true;
  });
}

export async function markPaid(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const method = str(fd, "method") as PaymentMethod;
  if (!METHODS.includes(method)) return { error: "支払方法を選んでください" };
  if (!(await pay(str(fd, "id"), method, me.id))) return { error: "未入金の請求ではありません" };
  await audit(me.id, "tuition.paid", str(fd, "id"), method);
  revalidatePath("/tuition");
  return { ok: "入金済みにしました（売上に記録）" };
}

/** 未入金をまとめて入金済みに（口座振替の結果反映など） */
export async function markAllPaid(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff(["OWNER", "ADMIN"]);
  const month = str(fd, "month");
  const method = str(fd, "method") as PaymentMethod;
  if (!isMonth(month) || !METHODS.includes(method)) return { error: "月と支払方法を選んでください" };
  const list = await db.invoice.findMany({ where: { month, status: "UNPAID", amount: { gt: 0 } }, select: { id: true } });
  let n = 0;
  for (const i of list) if (await pay(i.id, method, me.id)) n++;
  await audit(me.id, "tuition.paid_all", month, `${n}件 ${method}`);
  revalidatePath("/tuition");
  return { ok: `${n}件を入金済みにしました` };
}

export async function undoPaid(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff(["OWNER", "ADMIN"]);
  const inv = await db.invoice.findUnique({ where: { id: str(fd, "id") } });
  if (!inv || inv.status === "UNPAID") return { error: "戻せる請求ではありません" };
  await db.$transaction([
    ...(inv.paymentId ? [db.payment.deleteMany({ where: { id: inv.paymentId } })] : []),
    db.invoice.update({ where: { id: inv.id }, data: { status: "UNPAID", paidAt: null, paymentId: null } }),
  ]);
  await audit(me.id, "tuition.unpaid", inv.id);
  revalidatePath("/tuition");
  return { ok: "未入金に戻しました（売上の記録も削除）" };
}

export async function voidInvoice(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff(["OWNER", "ADMIN"]);
  const inv = await db.invoice.findUnique({ where: { id: str(fd, "id") } });
  if (!inv || inv.status !== "UNPAID") return { error: "未入金の請求のみ取り消せます" };
  await db.invoice.update({ where: { id: inv.id }, data: { status: "VOID", note: str(fd, "note") || "取消" } });
  await audit(me.id, "tuition.void", inv.id);
  revalidatePath("/tuition");
  return { ok: "請求を取り消しました" };
}
