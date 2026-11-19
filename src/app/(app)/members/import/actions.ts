"use server";
import { revalidatePath } from "next/cache";
import type { MemberStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fromJst } from "@/lib/format";
import type { ImportResult, ImportRow } from "./types";

const t = (v?: string | null) => (v ?? "").replace(/[　\s]+/g, " ").trim();
const digits = (v?: string | null) => (v ?? "").replace(/\D/g, "");

function splitName(full: string): [string, string] {
  const parts = t(full).split(" ");
  return parts.length > 1 ? [parts[0], parts.slice(1).join(" ")] : [parts[0] ?? "", ""];
}

function parseDate(v?: string): Date | null {
  const s = t(v).replace(/[年月]/g, "/").replace(/日/, "").replace(/-/g, "/");
  const m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const key = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const d = fromJst(key);
  return isNaN(d.getTime()) ? null : d;
}

function parseStatus(v?: string): MemberStatus {
  const s = t(v);
  if (/退会|解約|退所|無効|withdraw|inactive/i.test(s)) return "WITHDRAWN";
  if (/休会|休止|停止|suspend/i.test(s)) return "SUSPENDED";
  return "ACTIVE";
}

function parseGender(v?: string): string | null {
  const s = t(v);
  if (!s) return null;
  if (/^(男|male|m$)/i.test(s)) return "男性";
  if (/^(女|female|f$)/i.test(s)) return "女性";
  return s.slice(0, 20);
}

/** 会員を一括取り込み。外部ID → メール → 電話番号（＋姓）で既存会員と照合する */
export async function importMembers(rows: ImportRow[], mode: "skip" | "update", offset: number): Promise<ImportResult> {
  const me = await requireStaff(["OWNER", "ADMIN"]);
  const res: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  if (rows.length > 500) throw new Error("too many rows");

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNo = offset + i + 2; // ヘッダー行を1行目として数える
    try {
      let [lastName, firstName] = [t(r.lastName), t(r.firstName)];
      if (!lastName && !firstName && r.fullName) [lastName, firstName] = splitName(r.fullName);
      let [lastKana, firstKana] = [t(r.lastKana), t(r.firstKana)];
      if (!lastKana && !firstKana && r.fullKana) [lastKana, firstKana] = splitName(r.fullKana);
      if (!lastName) {
        res.errors.push({ row: rowNo, message: "氏名がありません" });
        continue;
      }
      const email = t(r.email).toLowerCase();
      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
      const phone = t(r.phone);
      const externalId = t(r.externalId) || null;
      const notes = [t(r.note)].filter(Boolean);

      let existing = externalId ? await db.member.findUnique({ where: { externalId } }) : null;
      if (!existing && validEmail) existing = await db.member.findUnique({ where: { email: validEmail } });
      if (!existing && digits(phone).length >= 10) {
        const cands = await db.member.findMany({ where: { lastName, phone: { not: null } }, take: 20 });
        existing = cands.find((c) => digits(c.phone) === digits(phone)) ?? null;
      }

      // 他の会員がすでに使っているメールは登録しない（メモに残す）
      let emailToSet: string | null = validEmail || null;
      if (emailToSet) {
        const owner = await db.member.findUnique({ where: { email: emailToSet }, select: { id: true } });
        if (owner && owner.id !== existing?.id) {
          notes.push(`メール: ${emailToSet}（他の会員と重複）`);
          emailToSet = null;
        }
      }
      if (email && !validEmail) notes.push(`メール: ${email}（形式不正）`);

      const data = {
        lastName,
        firstName,
        lastKana: lastKana || null,
        firstKana: firstKana || null,
        email: emailToSet,
        phone: phone || null,
        birthDate: parseDate(r.birthDate),
        gender: parseGender(r.gender),
        status: parseStatus(r.status),
      };

      if (existing) {
        if (mode === "skip") {
          res.skipped++;
          continue;
        }
        await db.member.update({
          where: { id: existing.id },
          data: {
            ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== "")),
            ...(r.status ? {} : { status: existing.status }),
            ...(externalId && !existing.externalId ? { externalId } : {}),
            ...(notes.length ? { note: [existing.note, ...notes].filter(Boolean).join("\n") } : {}),
          },
        });
        res.updated++;
      } else {
        await db.member.create({
          data: {
            ...data,
            externalId,
            joinedAt: parseDate(r.joinedAt) ?? new Date(),
            note: ["移行データから取り込み", ...notes].join("\n"),
          },
        });
        res.created++;
      }
    } catch (e) {
      res.errors.push({ row: rowNo, message: e instanceof Error ? e.message.slice(0, 120) : "取り込めませんでした" });
    }
  }
  await audit(me.id, "member.import", undefined, `新規${res.created} 更新${res.updated} スキップ${res.skipped} エラー${res.errors.length}`);
  revalidatePath("/members");
  return res;
}
