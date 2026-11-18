"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { str, optStr, type ActionState } from "@/lib/action";
import { BookingError, book } from "@/lib/booking";
import { createMemberSession, destroyMemberSession, getLinePending, LINE_PENDING_COOKIE, requireMember } from "@/lib/member-auth";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { appUrl } from "@/lib/url";
import { fmtDateTime } from "@/lib/format";

export async function memberLogout() {
  await destroyMemberSession();
  redirect("/my/login");
}

export async function registerMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const pending = await getLinePending();
  if (!pending) return { error: "LINEログインの有効期限が切れました。もう一度LINEでログインしてください" };
  const lastName = str(fd, "lastName");
  const firstName = str(fd, "firstName");
  const phone = str(fd, "phone");
  const email = optStr(fd, "email")?.toLowerCase() ?? null;
  if (!lastName || !firstName) return { error: "氏名を入力してください" };
  if (!/^[0-9+\-() ]{10,15}$/.test(phone)) return { error: "電話番号を正しく入力してください" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "メールアドレスの形式が正しくありません" };
  if (!str(fd, "agree")) return { error: "利用規約・個人情報の取扱いへの同意が必要です" };

  let member = await db.member.findUnique({ where: { lineUserId: pending.sub } });
  if (!member) {
    if (email && (await db.member.findUnique({ where: { email } })))
      return { error: "このメールアドレスは既に登録されています。施設スタッフにお問い合わせください" };
    member = await db.member.create({
      data: {
        lineUserId: pending.sub,
        lastName,
        firstName,
        lastKana: optStr(fd, "lastKana"),
        firstKana: optStr(fd, "firstKana"),
        phone,
        email,
        note: "会員ポータルから自己登録（LINE）",
      },
    });
    await audit(null, "member.self_register", member.id, `${lastName} ${firstName}`);
  }
  (await cookies()).delete(LINE_PENDING_COOKIE);
  await createMemberSession(member.id);
  redirect("/my");
}

/** 予約・申込み（レッスン・コート貸切・大会/イベント）。有料ならStripe決済画面へ、無料ならその場で予約 */
export async function applyEvent(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  if (me.status !== "ACTIVE") return { error: "現在予約できません（休会中）。施設スタッフにお問い合わせください" };
  const slotId = str(fd, "slotId");
  const slot = await db.slot.findUnique({ where: { id: slotId } });
  if (!slot || slot.status !== "OPEN") return { error: "この枠は予約できません" };
  if (slot.startsAt <= new Date()) return { error: "受付は終了しました" };
  const [count, dup] = await Promise.all([
    db.reservation.count({ where: { slotId, status: { in: ["RESERVED", "ATTENDED"] } } }),
    db.reservation.findFirst({ where: { slotId, memberId: me.id, status: { in: ["RESERVED", "ATTENDED"] } } }),
  ]);
  if (dup) return { error: "すでに予約済みです" };
  if (count >= slot.capacity) return { error: "定員に達しました" };

  if (slot.price <= 0) {
    try {
      await book(slotId, me.id);
    } catch (e) {
      if (e instanceof BookingError) return { error: e.message };
      throw e;
    }
    redirect("/my?applied=1");
  }

  if (!stripeConfigured()) return { error: "オンライン決済の準備中です。施設スタッフにお問い合わせください" };
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: { currency: "jpy", unit_amount: slot.price, product_data: { name: `${slot.title}（${fmtDateTime(slot.startsAt)}）` } },
      },
    ],
    metadata: { slotId, memberId: me.id },
    payment_intent_data: { metadata: { slotId, memberId: me.id } },
    customer_email: me.email ?? undefined,
    success_url: `${appUrl()}/my?paid=1`,
    cancel_url: `${appUrl()}/my/events/${slotId}`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });
  if (!session.url) return { error: "決済画面を作成できませんでした" };
  redirect(session.url);
}
