"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { BookingError } from "@/lib/booking";
import { str, type ActionState } from "@/lib/action";
import { lineMessagingConfigured, pushLine } from "@/lib/line-message";
import { bookMakeup, recordAbsence } from "@/lib/school";
import { notifyAbsence, notifyBooked } from "@/lib/notify";

async function contactOf(id: string) {
  const c = await db.lineContact.findUnique({ where: { id } });
  if (!c) throw new BookingError("相手が見つかりません");
  return c;
}

export async function sendReply(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const body = str(fd, "body");
  if (!body) return { error: "メッセージを入力してください" };
  if (body.length > 4900) return { error: "メッセージが長すぎます" };
  if (!lineMessagingConfigured()) return { error: "LINE_MESSAGING_TOKEN が未設定のため送信できません" };
  const c = await contactOf(str(fd, "contactId"));
  if (!c.followed) return { error: "この相手はブロック・友だち解除しているため送信できません" };
  const ok = await pushLine(c.lineUserId, body, { staffId: me.id });
  if (!ok) return { error: "送信できませんでした（月の送信上限やトークンを確認してください）" };
  await audit(me.id, "line.reply", c.id);
  revalidatePath(`/inbox/${c.id}`);
  return { ok: "送信しました" };
}

export async function setNeedsReply(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireStaff();
  const id = str(fd, "contactId");
  const needs = str(fd, "needs") === "1";
  await db.lineContact.update({ where: { id }, data: { needsReply: needs, ...(needs ? {} : { unread: 0 }) } });
  revalidatePath("/inbox", "layout");
  return { ok: needs ? "要対応に戻しました" : "対応済みにしました" };
}

/** LINEの友だちと会員をつなぐ（LINEログイン前の会員・移行した会員向け） */
export async function linkMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const c = await contactOf(str(fd, "contactId"));
  const memberId = str(fd, "memberId");
  if (!memberId) {
    await db.member.updateMany({ where: { lineUserId: c.lineUserId }, data: { lineUserId: null } });
    await audit(me.id, "line.unlink", c.id);
    revalidatePath(`/inbox/${c.id}`);
    return { ok: "会員とのつながりを外しました" };
  }
  const m = await db.member.findUnique({ where: { id: memberId } });
  if (!m) return { error: "会員が見つかりません" };
  if (m.lineUserId && m.lineUserId !== c.lineUserId) return { error: "この会員はすでに別のLINEとつながっています（会員詳細で確認してください）" };
  await db.$transaction([
    db.member.updateMany({ where: { lineUserId: c.lineUserId }, data: { lineUserId: null } }),
    db.member.update({ where: { id: m.id }, data: { lineUserId: c.lineUserId } }),
  ]);
  await audit(me.id, "line.link", c.id, `${m.lastName} ${m.firstName}`);
  revalidatePath(`/inbox/${c.id}`);
  return { ok: `${m.lastName} ${m.firstName}さんとつなぎました。このLINEから欠席連絡・振替予約ができるようになります` };
}

/** スタッフが代わりに欠席を受け付ける（振替を付与し、LINEで知らせる） */
export async function staffAbsence(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const id = str(fd, "reservationId");
  try {
    const credit = await recordAbsence(id, { reason: "欠席連絡（スタッフ受付）", staffId: me.id });
    await notifyAbsence(id, credit?.expiresAt ?? null);
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  await audit(me.id, "absence.staff", id);
  revalidatePath(`/inbox/${str(fd, "contactId")}`);
  return { ok: "欠席を受け付け、振替を付与しました（LINEでお知らせ済み）" };
}

/** スタッフが代わりに振替を予約する */
export async function staffMakeup(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const [creditId, slotId] = str(fd, "pick").split(":");
  const memberId = str(fd, "memberId");
  try {
    const r = await bookMakeup(creditId ?? "", slotId ?? "", memberId);
    await notifyBooked(r.id);
    await audit(me.id, "makeup.staff_book", r.id);
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/inbox/${str(fd, "contactId")}`);
  return { ok: "振替を予約しました（LINEでお知らせ済み）" };
}
