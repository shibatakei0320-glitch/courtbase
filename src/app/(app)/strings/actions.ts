"use server";
import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { int, optStr, str, type ActionState } from "@/lib/action";
import { fromJst } from "@/lib/format";
import { notifyStringDone } from "@/lib/notify";

export async function createStringJob(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const memberId = optStr(fd, "memberId");
  const customer = optStr(fd, "customer");
  if (!memberId && !customer) return { error: "会員を選ぶか、お客さまの名前を入力してください" };
  const racket = str(fd, "racket");
  const stringName = str(fd, "stringName");
  const tension = str(fd, "tension");
  if (!racket || !stringName || !tension) return { error: "ラケット・ガット・テンションを入力してください" };
  const due = str(fd, "dueAt");
  const j = await db.stringJob.create({
    data: {
      memberId,
      customer: memberId ? null : customer,
      racket,
      stringName,
      tension,
      price: Math.max(0, int(fd, "price")),
      note: optStr(fd, "note"),
      dueAt: /^\d{4}-\d{2}-\d{2}$/.test(due) ? fromJst(due, "18:00") : null,
      staffId: me.id,
    },
  });
  await audit(me.id, "string.create", j.id, `${racket} ${stringName} ${tension}`);
  revalidatePath("/strings");
  if (memberId) revalidatePath(`/members/${memberId}`);
  return { ok: "張り替えを受け付けました" };
}

/** 仕上がり（LINEで知らせる）・受け渡し（支払い）・取消 */
export async function updateStringJob(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const j = await db.stringJob.findUnique({ where: { id: str(fd, "id") } });
  if (!j) return { error: "受付が見つかりません" };
  const op = str(fd, "op");
  let msg = "更新しました";
  if (op === "done" && j.status === "RECEIVED") {
    await db.stringJob.update({ where: { id: j.id }, data: { status: "DONE", doneAt: new Date() } });
    const sent = await notifyStringDone(j.id);
    msg = sent ? "仕上がりにして、LINEでお知らせしました" : "仕上がりにしました";
  } else if (op === "deliver" && (j.status === "DONE" || j.status === "RECEIVED")) {
    const method = str(fd, "method") as PaymentMethod;
    await db.$transaction(async (tx) => {
      let paymentId: string | null = null;
      if (j.price > 0 && method !== ("LATER" as PaymentMethod)) {
        if (!["CASH", "CARD", "TRANSFER", "OTHER"].includes(method)) throw new Error("支払方法が不正です");
        const p = await tx.payment.create({ data: { memberId: j.memberId, amount: j.price, method, description: `ガット張替（${j.stringName}）`, staffId: me.id } });
        paymentId = p.id;
      }
      await tx.stringJob.update({ where: { id: j.id }, data: { status: "DELIVERED", deliveredAt: new Date(), doneAt: j.doneAt ?? new Date(), paymentId } });
    });
    msg = j.price > 0 && method !== ("LATER" as PaymentMethod) ? "お渡しして、料金を売上に記録しました" : "お渡ししました";
  } else if (op === "pay" && j.status === "DELIVERED" && !j.paymentId && j.price > 0) {
    const method = str(fd, "method") as PaymentMethod;
    const p = await db.payment.create({ data: { memberId: j.memberId, amount: j.price, method, description: `ガット張替（${j.stringName}）`, staffId: me.id } });
    await db.stringJob.update({ where: { id: j.id }, data: { paymentId: p.id } });
    msg = "料金を受け取りました";
  } else if (op === "cancel" && j.status !== "DELIVERED") {
    await db.stringJob.update({ where: { id: j.id }, data: { status: "CANCELED" } });
    msg = "取り消しました";
  } else return { error: "この操作はできません" };
  await audit(me.id, `string.${op}`, j.id);
  revalidatePath("/strings");
  if (j.memberId) revalidatePath(`/members/${j.memberId}`);
  return { ok: msg };
}
