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
import { notifyAbsence, notifyBooked, notifyCanceled, notifyMakeupCanceled, notifyWaitlist } from "@/lib/notify";
import { ADVANCE_DAYS, MAX_MIN, STEP_MIN, clearExpiredHolds, courtPrice, overlapsAny } from "@/lib/court-booking";
import { fmtDateTime, fromJst, jstDateKey } from "@/lib/format";
import { createMemberSession, destroyMemberSession, getLinePending, LINE_PENDING_COOKIE, requireMember } from "@/lib/member-auth";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { appUrl } from "@/lib/url";
import { familyMember, familyOf } from "@/lib/family";
import { bookMakeup, cancelMakeup, memberReportAbsence, undoAbsence } from "@/lib/school";

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
      return { error: "このメールアドレスは既に登録されています。スタッフにお問い合わせください" };
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
  if (me.status !== "ACTIVE") return { error: "現在予約できません（休会中）。スタッフにお問い合わせください" };
  const slotId = str(fd, "slotId");
  const slot = await db.slot.findUnique({ where: { id: slotId } });
  if (!slot || slot.status !== "OPEN" || slot.memberBooked) return { error: "この枠は予約できません" };
  if (slot.classId) return { error: "クラスの回は「振替」から予約してください" };
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
    if (!stripeConfigured()) return { error: "オンライン決済の準備中です。スタッフにお問い合わせください" };
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

  if (!stripeConfigured()) return { error: "オンライン決済の準備中です。スタッフにお問い合わせください" };
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
  const famIds = (await familyOf(me)).map((m) => m.id);
  const r = await db.reservation.findFirst({ where: { id: str(fd, "id"), memberId: { in: famIds }, status: "RESERVED" }, include: { slot: true } });
  if (!r) return { error: "キャンセルできる予約がありません" };
  if (r.kind === "REGULAR") return { error: "クラスの回は「欠席連絡」からお休みしてください" };
  const { at, hours } = await cancelDeadline(r.slot.startsAt);
  if (Date.now() > at.getTime()) return { error: `キャンセルの期限（開始の${hours}時間前）を過ぎています。スタッフにお問い合わせください` };
  if (r.kind === "MAKEUP") {
    try {
      await cancelMakeup(r.id);
    } catch (e) {
      if (e instanceof BookingError) return { error: e.message };
      throw e;
    }
    await audit(null, "makeup.member_cancel", r.id);
    await notifyMakeupCanceled(r.id);
    redirect(`/my/school?m=${r.memberId}&makeupCanceled=1`);
  }
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
  if (me.status !== "ACTIVE") return { error: "現在予約できません（休会中）。スタッフにお問い合わせください" };
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
    return { error: "オンライン決済の準備中です。スタッフにお問い合わせください" };
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

// ---- スクール：欠席連絡・振替 ----

/** 欠席連絡（期限内なら振替の権利が付く） */
export async function reportAbsence(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const famIds = (await familyOf(me)).map((m) => m.id);
  const r = await db.reservation.findFirst({ where: { id: str(fd, "id"), memberId: { in: famIds } } });
  if (!r) return { error: "欠席連絡できる回がありません" };
  let credit;
  try {
    credit = (await memberReportAbsence(r.memberId, r.id)).credit;
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  await audit(null, "absence.member", r.id);
  await notifyAbsence(r.id, credit?.expiresAt ?? null);
  revalidatePath("/my", "layout");
  return { ok: "欠席を受け付けました。振替が1回分付きました" };
}

/** 欠席連絡の取り消し（振替を使っておらず、席が空いている場合） */
export async function undoMyAbsence(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const famIds = (await familyOf(me)).map((m) => m.id);
  const r = await db.reservation.findFirst({ where: { id: str(fd, "id"), memberId: { in: famIds }, kind: "REGULAR" } });
  if (!r) return { error: "取り消せる欠席連絡がありません" };
  try {
    await undoAbsence(r.id);
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  await audit(null, "absence.member_undo", r.id);
  revalidatePath("/my", "layout");
  return { ok: "欠席連絡を取り消しました。いつもどおり出席の予定です" };
}

/** 振替の予約（本人または子ども） */
export async function bookMyMakeup(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const who = await familyMember(me, str(fd, "memberId"));
  if (!who) return { error: "会員が見つかりません" };
  if (who.status !== "ACTIVE") return { error: "現在予約できません（休会中）。スタッフにお問い合わせください" };
  let id: string;
  try {
    const r = await bookMakeup(str(fd, "creditId"), str(fd, "slotId"), who.id);
    id = r.id;
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  await audit(null, "makeup.member_book", id);
  await notifyBooked(id);
  redirect(`/my/school?m=${who.id}&booked=1`);
}

/** 保護者がお子さまを会員として登録する（クラスへの在籍はスクールが登録） */
export async function addChild(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  if (me.guardianId) return { error: "保護者の方のアカウントから登録してください" };
  const lastName = str(fd, "lastName") || me.lastName;
  const firstName = str(fd, "firstName");
  const birth = str(fd, "birthDate");
  if (!firstName) return { error: "お子さまのお名前を入力してください" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return { error: "生年月日を入力してください" };
  const dup = await db.member.findFirst({ where: { guardianId: me.id, lastName, firstName } });
  if (dup) return { error: "このお子さまはすでに登録されています" };
  const child = await db.member.create({
    data: {
      guardianId: me.id,
      lastName,
      firstName,
      lastKana: optStr(fd, "lastKana") ?? me.lastKana,
      firstKana: optStr(fd, "firstKana"),
      birthDate: fromJst(birth),
      gender: optStr(fd, "gender"),
      phone: me.phone,
      note: "保護者が会員ページから登録",
    },
  });
  await audit(null, "member.child_register", child.id, `${lastName} ${firstName}（保護者 ${me.lastName} ${me.firstName}）`);
  revalidatePath("/my", "layout");
  return { ok: `${firstName}さんを登録しました。クラスのお申し込みはスクールにご連絡ください` };
}

// ---- 協会・外部の大会への申込み ----

export async function applyTournament(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const who = await familyMember(me, str(fd, "memberId"));
  if (!who) return { error: "申し込む方を選んでください" };
  const t = await db.tournament.findUnique({ where: { id: str(fd, "tournamentId") } });
  if (!t || !t.published) return { error: "この大会には申し込めません" };
  if ((t.entryDeadline && t.entryDeadline < new Date()) || t.date < new Date()) return { error: "申込みの締切を過ぎています。スタッフにお問い合わせください" };
  const category = str(fd, "category");
  if (!t.categories.includes(category)) return { error: "種目を選んでください" };
  const partner = optStr(fd, "partner");
  if (/ダブルス|ミックス/.test(category) && !partner) return { error: "ダブルスはペアの方のお名前を入力してください" };
  const dup = await db.tournamentEntry.findUnique({ where: { tournamentId_memberId_category: { tournamentId: t.id, memberId: who.id, category } } });
  if (dup && dup.status !== "CANCELED") return { error: "この種目にはすでに申し込んでいます" };
  if (dup) await db.tournamentEntry.update({ where: { id: dup.id }, data: { status: "ENTERED", partner, note: optStr(fd, "note") } });
  else await db.tournamentEntry.create({ data: { tournamentId: t.id, memberId: who.id, category, partner, note: optStr(fd, "note") } });
  await audit(null, "tournament.member_entry", t.id, `${who.lastName} ${who.firstName} ${category}`);
  revalidatePath("/my/tournaments");
  return { ok: `${who.firstName}さんの「${t.name}／${category}」の申込みを受け付けました。スクールがまとめて協会に申し込みます` };
}

export async function cancelTournamentEntry(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const famIds = (await familyOf(me)).map((m) => m.id);
  const e = await db.tournamentEntry.findFirst({ where: { id: str(fd, "id"), memberId: { in: famIds }, status: "ENTERED" }, include: { tournament: true } });
  if (!e) return { error: "取り消せる申込みがありません（協会に提出済みの場合はスタッフにご連絡ください）" };
  if (e.tournament.entryDeadline && e.tournament.entryDeadline < new Date()) return { error: "締切を過ぎたため取り消せません。スタッフにご連絡ください" };
  await db.tournamentEntry.update({ where: { id: e.id }, data: { status: "CANCELED" } });
  await audit(null, "tournament.member_cancel", e.id);
  revalidatePath("/my/tournaments");
  return { ok: "申込みを取り消しました" };
}
