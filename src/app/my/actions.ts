"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, facilityModeOn } from "@/lib/db";
import { audit } from "@/lib/audit";
import { int, str, optStr, type ActionState } from "@/lib/action";
import { BookingError, book, bookEntry, cancelDeadline, cancelReservation } from "@/lib/booking";
import { categoryLabel, currentPrice, parseEntry } from "@/lib/entry";
import { refundReservation } from "@/lib/refund";
import { notifyBooked, notifyCanceled, notifyWaitlist } from "@/lib/notify";
import { ADVANCE_DAYS, MAX_MIN, STEP_MIN, clearExpiredHolds, courtPrice, overlapsAny } from "@/lib/court-booking";
import { fmtDateTime, fromJst, jstDateKey } from "@/lib/format";
import { createMemberSession, destroyMemberSession, getLinePending, LINE_PENDING_COOKIE, requireMember } from "@/lib/member-auth";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { appUrl } from "@/lib/url";

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
    // 移行・スタッフ登録済みの会員（LINE未連携）で、氏名と電話番号が一致すればその会員につなぐ
    const d = (v: string | null) => (v ?? "").replace(/\D/g, "");
    const cands = await db.member.findMany({ where: { lineUserId: null, lastName, firstName, status: { not: "WITHDRAWN" } }, take: 20 });
    const match = cands.find((c) => d(c.phone) && d(c.phone) === d(phone));
    if (match) {
      member = await db.member.update({ where: { id: match.id }, data: { lineUserId: pending.sub, ...(email && !match.email && !(await db.member.findUnique({ where: { email } })) ? { email } : {}) } });
      await audit(null, "member.line_link", member.id, `${lastName} ${firstName}`);
    }
  }
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
  if (!slot || slot.status !== "OPEN" || slot.memberBooked) return { error: "この枠は予約できません" };
  if (slot.startsAt <= new Date()) return { error: "受付は終了しました" };

  // 種目のある大会：種目を選び、パートナー名・チーム名を入力してエントリー
  const categoryId = str(fd, "categoryId");
  if (categoryId || (await db.eventCategory.count({ where: { slotId } })) > 0) {
    const cat = categoryId ? await db.eventCategory.findFirst({ where: { id: categoryId, slotId } }) : null;
    if (!cat) return { error: "種目を選んでください" };
    const entry = parseEntry(cat, fd, `${me.lastName} ${me.firstName}`);
    if (!entry.ok) return { error: entry.error };
    const [taken, dupEntry] = await Promise.all([
      db.reservation.count({ where: { categoryId: cat.id, status: { in: ["RESERVED", "ATTENDED"] } } }),
      db.reservation.findFirst({ where: { categoryId: cat.id, memberId: me.id, status: { in: ["RESERVED", "ATTENDED"] } } }),
    ]);
    if (dupEntry) return { error: "この種目にはすでにエントリーしています" };
    if (taken >= cat.capacity) return { error: "この種目は定員に達しました。キャンセル待ちに登録できます" };
    const fee = currentPrice(cat);
    if (fee <= 0) {
      try {
        const r = await bookEntry(slotId, cat.id, me.id, entry);
        await db.waitlist.deleteMany({ where: { categoryId: cat.id, memberId: me.id } });
        await notifyBooked(r.id);
      } catch (e) {
        if (e instanceof BookingError) return { error: e.message };
        throw e;
      }
      redirect(`/my/events/${slotId}?entered=1`);
    }
    if (!stripeConfigured()) return { error: "オンライン決済の準備中です。施設スタッフにお問い合わせください" };
    const meta = { slotId, memberId: me.id, categoryId: cat.id, teamName: entry.teamName ?? "", players: JSON.stringify(entry.players).slice(0, 490) };
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{ quantity: 1, price_data: { currency: "jpy", unit_amount: fee, product_data: { name: `${slot.title} ${categoryLabel(cat)}（${fmtDateTime(slot.startsAt)}）` } } }],
      metadata: meta,
      payment_intent_data: { metadata: { slotId, memberId: me.id, categoryId: cat.id } },
      customer_email: me.email ?? undefined,
      success_url: `${appUrl()}/my/events/${slotId}?paid=1`,
      cancel_url: `${appUrl()}/my/events/${slotId}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });
    if (!session.url) return { error: "決済画面を作成できませんでした" };
    redirect(session.url);
  }

  const [count, dup] = await Promise.all([
    db.reservation.count({ where: { slotId, status: { in: ["RESERVED", "ATTENDED"] } } }),
    db.reservation.findFirst({ where: { slotId, memberId: me.id, status: { in: ["RESERVED", "ATTENDED"] } } }),
  ]);
  if (dup) return { error: "すでに予約済みです" };
  if (count >= slot.capacity) return { error: "定員に達しました" };

  if (slot.price <= 0) {
    try {
      const r = await book(slotId, me.id);
      await notifyBooked(r.id);
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

/** 会員による予約キャンセル（期限内のみ。カード払いは全額返金） */
export async function cancelMyReservation(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const r = await db.reservation.findFirst({ where: { id: str(fd, "id"), memberId: me.id, status: "RESERVED" }, include: { slot: true } });
  if (!r) return { error: "キャンセルできる予約がありません" };
  const { at, hours } = await cancelDeadline(r.slot.startsAt);
  if (Date.now() > at.getTime()) return { error: `キャンセルの期限（開始の${hours}時間前）を過ぎています。施設スタッフにお問い合わせください` };
  try {
    await cancelReservation(r.id);
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  const amt = await refundReservation(r.id, "会員によるキャンセル");
  await audit(null, "reservation.member_cancel", r.id, amt ? `返金${amt}` : undefined);
  await notifyCanceled(r.id, amt);
  if (r.categoryId) await notifyWaitlist(r.categoryId);
  redirect(`/my?canceled=${amt}`);
}

/** 時間を選んでコートを予約。有料なら30分仮押さえして決済へ */
export async function bookCourt(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  if (me.status !== "ACTIVE") return { error: "現在予約できません（休会中）。施設スタッフにお問い合わせください" };
  if (!(await facilityModeOn())) return { error: "コートの予約は現在受け付けていません" };
  const courtId = str(fd, "courtId");
  const date = str(fd, "date");
  const start = str(fd, "start");
  const minutes = int(fd, "minutes");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start)) return { error: "日時を選んでください" };
  if (minutes < STEP_MIN || minutes > MAX_MIN || minutes % STEP_MIN) return { error: "利用時間を選んでください" };
  const [court, setting] = await Promise.all([db.court.findUnique({ where: { id: courtId } }), db.setting.findUnique({ where: { id: 1 } })]);
  if (!court || !court.active || !court.memberBookable) return { error: "このコートは予約できません" };
  const startsAt = fromJst(date, start);
  const endsAt = new Date(startsAt.getTime() + minutes * 60_000);
  const open = fromJst(date, `${String(setting?.openHour ?? 7).padStart(2, "0")}:00`);
  const close = new Date(fromJst(date).getTime() + (setting?.closeHour ?? 23) * 3600_000);
  if (startsAt < open || endsAt > close) return { error: "営業時間外です" };
  if (startsAt.getTime() <= Date.now()) return { error: "過ぎた時間は予約できません" };
  if (date > jstDateKey(new Date(Date.now() + ADVANCE_DAYS * 86400_000))) return { error: `${ADVANCE_DAYS}日先までの予約ができます` };
  const price = courtPrice(court.hourlyPrice, minutes);

  await clearExpiredHolds(courtId);
  let slotId: string;
  try {
    slotId = await db.$transaction(async (tx) => {
      // 同じコートへの同時予約を防ぐ
      await tx.$queryRaw`SELECT id FROM "Court" WHERE id = ${courtId} FOR UPDATE`;
      const clash = await tx.slot.findMany({
        where: { courtId, status: "OPEN", startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
        select: { startsAt: true, endsAt: true, heldUntil: true },
      });
      const now = Date.now();
      if (overlapsAny(clash.filter((c) => !c.heldUntil || c.heldUntil.getTime() > now).map((c) => [c.startsAt.getTime(), c.endsAt.getTime()] as const), startsAt.getTime(), endsAt.getTime()))
        throw new BookingError("この時間はすでに埋まっています。別の時間を選んでください");
      const slot = await tx.slot.create({
        data: {
          title: "コート利用",
          kind: "RENTAL",
          courtId,
          startsAt,
          endsAt,
          capacity: 1,
          price,
          memberBooked: true,
          note: `${me.lastName} ${me.firstName}さんが会員ページから予約`,
          ...(price > 0 ? { heldById: me.id, heldUntil: new Date(Date.now() + 32 * 60_000) } : {}),
        },
      });
      if (price <= 0) await tx.reservation.create({ data: { slotId: slot.id, memberId: me.id } });
      return slot.id;
    });
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }

  if (price <= 0) {
    const r = await db.reservation.findFirst({ where: { slotId, memberId: me.id } });
    if (r) await notifyBooked(r.id);
    redirect("/my?applied=1");
  }
  if (!stripeConfigured()) {
    await db.slot.delete({ where: { id: slotId } });
    return { error: "オンライン決済の準備中です。施設スタッフにお問い合わせください" };
  }
  let url: string | null = null;
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{ quantity: 1, price_data: { currency: "jpy", unit_amount: price, product_data: { name: `${court.name} コート利用（${fmtDateTime(startsAt)}〜・${minutes}分）` } } }],
      metadata: { slotId, memberId: me.id, court: "1" },
      payment_intent_data: { metadata: { slotId, memberId: me.id } },
      customer_email: me.email ?? undefined,
      success_url: `${appUrl()}/my?paid=1`,
      cancel_url: `${appUrl()}/my/court?date=${date}&court=${courtId}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });
    url = session.url;
  } catch (e) {
    await db.slot.delete({ where: { id: slotId } });
    console.error(e);
    return { error: "決済画面を作成できませんでした。時間をおいてお試しください" };
  }
  if (!url) return { error: "決済画面を作成できませんでした" };
  redirect(url);
}

/** キャンセル待ちに登録（満員の種目のみ） */
export async function joinWaitlist(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const cat = await db.eventCategory.findUnique({ where: { id: str(fd, "categoryId") }, include: { slot: true } });
  if (!cat || cat.slot.status !== "OPEN" || cat.slot.startsAt <= new Date()) return { error: "この種目にはキャンセル待ちできません" };
  const [taken, mine] = await Promise.all([
    db.reservation.count({ where: { categoryId: cat.id, status: { in: ["RESERVED", "ATTENDED"] } } }),
    db.reservation.findFirst({ where: { categoryId: cat.id, memberId: me.id, status: { in: ["RESERVED", "ATTENDED"] } } }),
  ]);
  if (mine) return { error: "すでにエントリーしています" };
  if (taken < cat.capacity) return { error: "空きがあります。このままエントリーできます" };
  await db.waitlist.upsert({ where: { categoryId_memberId: { categoryId: cat.id, memberId: me.id } }, create: { categoryId: cat.id, memberId: me.id }, update: {} });
  revalidatePath(`/my/events/${cat.slotId}`);
  return { ok: "キャンセル待ちに登録しました。空きが出たらLINEでお知らせします" };
}

export async function leaveWaitlist(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  await db.waitlist.deleteMany({ where: { categoryId: str(fd, "categoryId"), memberId: me.id } });
  revalidatePath(`/my/events/${str(fd, "slotId")}`);
  return { ok: "キャンセル待ちを取り消しました" };
}
