import "server-only";
import type { Member } from "@prisma/client";
import { db } from "./db";

/*
 * 家族（保護者とジュニア会員）
 * - ジュニア会員は guardianId に保護者の会員を持つ。保護者のLINE・会員ページから、子どもの欠席連絡・振替予約をする
 * - 子ども本人にLINEがなければ、お知らせは保護者のLINEに届く
 */

/** ログイン中の会員と、その子ども（退会者を除く）。本人が先頭 */
export async function familyOf(me: Pick<Member, "id">) {
  const [self, children] = await Promise.all([
    db.member.findUniqueOrThrow({ where: { id: me.id } }),
    db.member.findMany({ where: { guardianId: me.id, status: { not: "WITHDRAWN" } }, orderBy: [{ birthDate: "asc" }, { createdAt: "asc" }] }),
  ]);
  return [self, ...children];
}

/** 家族の中の会員か確認して返す（他人の会員IDは受け付けない） */
export async function familyMember(me: Pick<Member, "id">, memberId: string | null | undefined) {
  const fam = await familyOf(me);
  return fam.find((m) => m.id === (memberId || me.id)) ?? null;
}

/** お知らせの送り先LINE（本人 → なければ保護者） */
export function lineTo(m: { lineUserId: string | null; guardian?: { lineUserId: string | null } | null }) {
  return m.lineUserId ?? m.guardian?.lineUserId ?? null;
}

/** 呼び名（子どもは名前で） */
export const callName = (m: Pick<Member, "lastName" | "firstName" | "guardianId">) => (m.guardianId ? `${m.firstName}さん` : `${m.lastName}さん`);
