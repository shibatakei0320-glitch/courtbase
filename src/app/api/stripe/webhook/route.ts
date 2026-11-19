import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { BookingError, book, bookEntry } from "@/lib/booking";
import { stripe } from "@/lib/stripe";
import { fmtDateTime } from "@/lib/format";
import { notifyBooked } from "@/lib/notify";

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
  const s = event.data.object as Stripe.Checkout.Session;
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    if (s.payment_status === "paid") await fulfill(s);
  } else if (event.type === "checkout.session.expired") {
    await releaseHold(s);
  }
  return NextResponse.json({ received: true });
}

/** 支払われなかった時間指定のコート予約の仮押さえを解放 */
async function releaseHold(s: Stripe.Checkout.Session) {
  const slotId = s.metadata?.slotId;
  if (!slotId || s.metadata?.court !== "1") return;
  const active = await db.reservation.count({ where: { slotId, status: { not: "CANCELED" } } });
  if (active === 0) await db.slot.deleteMany({ where: { id: slotId, memberBooked: true } });
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
  let paymentId: string;
  try {
    const p = await db.payment.create({
      data: { memberId, amount, method: "CARD", description: `${label}・オンライン決済`, stripeSessionId: s.id, stripePaymentIntentId: paymentIntent },
    });
    paymentId = p.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    throw e;
  }

  try {
    if (slot?.memberBooked) {
      // 仮押さえが期限切れで別の人に取られていないか（仮押さえの持ち主か、空いている場合のみ確定）
      if (slot.status !== "OPEN" || (slot.heldById && slot.heldById !== memberId)) throw new BookingError("この時間はすでに埋まっています");
      await db.slot.update({ where: { id: slotId }, data: { heldById: null, heldUntil: null } });
    }
    const categoryId = s.metadata?.categoryId;
    let r;
    if (categoryId) {
      let players: string[] = [];
      try {
        const p = JSON.parse(s.metadata?.players ?? "[]");
        if (Array.isArray(p)) players = p.map(String).slice(0, 20);
      } catch {}
      r = await bookEntry(slotId, categoryId, memberId, { teamName: s.metadata?.teamName || null, players });
      await db.waitlist.deleteMany({ where: { categoryId, memberId } });
    } else {
      r = await book(slotId, memberId);
    }
    await db.payment.update({ where: { id: paymentId }, data: { reservationId: r.id } });
    await db.auditLog.create({ data: { action: "reservation.online_paid", target: r.id, detail: `${label} ${amount}円` } });
    await notifyBooked(r.id, amount);
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
    // 定員超過などで予約できなかった場合は全額返金
    if (paymentIntent) await stripe().refunds.create({ payment_intent: paymentIntent }, { idempotencyKey: `refund-${s.id}` });
    await db.payment.update({ where: { id: paymentId }, data: { refundedAt: new Date() } });
    await db.payment.create({ data: { memberId, amount: -amount, method: "CARD", description: `${label}・自動返金（${e.message}）`, stripePaymentIntentId: paymentIntent } });
    await db.auditLog.create({ data: { action: "reservation.online_refunded", target: slotId, detail: `${e.message} ${amount}円` } });
    if (slot?.memberBooked) await db.slot.updateMany({ where: { id: slotId, memberBooked: true }, data: { status: "CANCELED", heldById: null, heldUntil: null } });
  }
}
