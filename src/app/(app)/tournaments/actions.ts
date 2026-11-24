"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EntryStatus, PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { bool, int, optStr, str, type ActionState } from "@/lib/action";
import { addDays, fromJst } from "@/lib/format";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function saveTournament(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff(["OWNER", "ADMIN"]);
  const id = str(fd, "id");
  const name = str(fd, "name");
  const date = str(fd, "date");
  if (!name) return { error: "大会名を入力してください" };
  if (!DATE.test(date)) return { error: "開催日を入力してください" };
  const deadline = str(fd, "entryDeadline");
  const categories = str(fd, "categories").split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 40);
  if (!categories.length) return { error: "種目を1行に1つずつ入力してください" };
  const data = {
    name,
    organizer: str(fd, "organizer") || "山口県テニス協会",
    date: fromJst(date, "09:00"),
    venue: optStr(fd, "venue"),
    entryDeadline: DATE.test(deadline) ? new Date(fromJst(addDays(deadline, 1)).getTime() - 1) : null,
    fee: Math.max(0, int(fd, "fee")),
    categories,
    description: optStr(fd, "description"),
    published: id ? bool(fd, "published") : true,
  };
  if (id) {
    await db.tournament.update({ where: { id }, data });
    await audit(me.id, "tournament.update", name);
    revalidatePath(`/tournaments/${id}`);
    return { ok: "保存しました" };
  }
  const t = await db.tournament.create({ data });
  await audit(me.id, "tournament.create", name);
  redirect(`/tournaments/${t.id}`);
}

/** スタッフがエントリーを追加（電話・窓口での申込み） */
export async function addEntry(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const tournamentId = str(fd, "tournamentId");
  const memberId = str(fd, "memberId");
  const category = str(fd, "category");
  const t = await db.tournament.findUnique({ where: { id: tournamentId } });
  if (!t || !t.categories.includes(category)) return { error: "種目を選んでください" };
  const dup = await db.tournamentEntry.findUnique({ where: { tournamentId_memberId_category: { tournamentId, memberId, category } } });
  if (dup && dup.status !== "CANCELED") return { error: "この会員はこの種目にすでに申し込んでいます" };
  if (dup) await db.tournamentEntry.update({ where: { id: dup.id }, data: { status: "ENTERED", partner: optStr(fd, "partner"), note: optStr(fd, "note") } });
  else await db.tournamentEntry.create({ data: { tournamentId, memberId, category, partner: optStr(fd, "partner"), note: optStr(fd, "note") } });
  await audit(me.id, "tournament.entry_add", tournamentId, `${memberId} ${category}`);
  revalidatePath(`/tournaments/${tournamentId}`);
  return { ok: "エントリーを追加しました" };
}

export async function updateEntry(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const e = await db.tournamentEntry.findUnique({ where: { id: str(fd, "id") }, include: { tournament: true, member: true } });
  if (!e) return { error: "エントリーが見つかりません" };
  const op = str(fd, "op");
  if (op === "status") {
    const status = str(fd, "status") as EntryStatus;
    if (!["ENTERED", "SUBMITTED", "CANCELED"].includes(status)) return { error: "不正な状態です" };
    await db.tournamentEntry.update({ where: { id: e.id }, data: { status } });
  } else if (op === "pay") {
    if (e.paymentId || e.tournament.fee <= 0) return { error: "受け取る参加費がありません" };
    const method = str(fd, "method") as PaymentMethod;
    if (!["CASH", "CARD", "TRANSFER", "OTHER"].includes(method)) return { error: "支払方法を選んでください" };
    const p = await db.payment.create({ data: { memberId: e.memberId, amount: e.tournament.fee, method, description: `大会参加費：${e.tournament.name}（${e.category}）`, staffId: me.id } });
    await db.tournamentEntry.update({ where: { id: e.id }, data: { paymentId: p.id } });
  } else return { error: "不正な操作です" };
  await audit(me.id, `tournament.entry_${op}`, e.id);
  revalidatePath(`/tournaments/${e.tournamentId}`);
  return { ok: "更新しました" };
}

/** 申込み中のエントリーをまとめて「協会に提出済み」にする */
export async function markSubmitted(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff(["OWNER", "ADMIN"]);
  const id = str(fd, "tournamentId");
  const { count } = await db.tournamentEntry.updateMany({ where: { tournamentId: id, status: "ENTERED" }, data: { status: "SUBMITTED" } });
  await audit(me.id, "tournament.submitted", id, `${count}件`);
  revalidatePath(`/tournaments/${id}`);
  return { ok: `${count}件を「協会に提出済み」にしました` };
}
