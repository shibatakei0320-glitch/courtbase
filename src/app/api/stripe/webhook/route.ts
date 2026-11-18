import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { BookingError, book } from "@/lib/booking";
import { stripe } from "@/lib/stripe";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");
  if (!secret || !sig) return NextResponse.json({ error: "not configured" }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), sig, secret);
  } catch (e) {
    console.error("[stripe] signature error", e);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.payment_status === "paid") await fulfill(s);
  }
  return NextResponse.json({ received: true });
}

async function fulfill(s: Stripe.Checkout.Session) {
  const slotId = s.metadata?.slotId;
  const memberId = s.metadata?.memberId;
  const amount = s.amount_total ?? 0;
  const paymentIntent = typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null);
  if (!slotId || !memberId) return;
  const slot = await db.slot.findUnique({ where: { id: slotId } });
  const label = slot ? `${slot.title}（${fmtDateTime(slot.startsAt)}）` : "予約料金";

  // 決済の記録を先に作成（stripeSessionId が一意なので、Webhookの重複配信はここで弾かれる）
  try {
    await db.payment.create({
      data: { memberId, amount, method: "CARD", description: `${label}・オンライン決済`, stripeSessionId: s.id, stripePaymentIntentId: paymentIntent },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    throw e;
  }

  try {
    const r = await book(slotId, memberId);
    await db.auditLog.create({ data: { action: "reservation.online_paid", target: r.id, detail: `${label} ${amount}円` } });
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
    // 定員超過などで予約できなかった場合は全額返金
    if (paymentIntent) await stripe().refunds.create({ payment_intent: paymentIntent }, { idempotencyKey: `refund-${s.id}` });
    await db.payment.create({ data: { memberId, amount: -amount, method: "CARD", description: `${label}・自動返金（${e.message}）`, stripePaymentIntentId: paymentIntent } });
    await db.auditLog.create({ data: { action: "reservation.online_refunded", target: slotId, detail: `${e.message} ${amount}円` } });
  }
}
