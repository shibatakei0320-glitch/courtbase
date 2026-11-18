import "server-only";
import { db } from "./db";
import { stripe } from "./stripe";

/** 予約に紐づくオンライン決済を全額返金し、返金額を返す（紐づく決済がなければ0） */
export async function refundReservation(reservationId: string, reason: string): Promise<number> {
  const p = await db.payment.findFirst({ where: { reservationId, refundedAt: null, amount: { gt: 0 } } });
  if (!p) return 0;
  if (p.stripePaymentIntentId) {
    await stripe().refunds.create({ payment_intent: p.stripePaymentIntentId }, { idempotencyKey: `refund-res-${reservationId}` });
  }
  await db.$transaction([
    db.payment.update({ where: { id: p.id }, data: { refundedAt: new Date() } }),
    db.payment.create({
      data: { memberId: p.memberId, amount: -p.amount, method: p.method, description: `${p.description}・返金（${reason}）`, stripePaymentIntentId: p.stripePaymentIntentId },
    }),
  ]);
  return p.amount;
}
