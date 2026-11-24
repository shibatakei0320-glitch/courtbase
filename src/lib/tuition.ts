import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { addDays, fromJst } from "./format";
import { enrollmentCovers, weekdayOf } from "./school";

/*
 * 月謝（会員×月の請求）
 *
 * - 在籍クラスごとに、クラスの月謝（月額プラン）を請求する
 * - 月の途中で入会・退会・クラス変更した場合は、その月のレッスン日数（曜日の数）で按分（設定でオフにすると満額）
 * - 休会中の月はクラスの月謝の代わりに休会費
 * - 初めての月謝には入会金を加える
 * - 支払済み・取消済みの請求は作り直さない
 */

export type Line = { label: string; amount: number };
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const isMonth = (m: string) => MONTH.test(m);

export function monthRange(month: string) {
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const next = `${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, "0")}-01`;
  return { first, last: addDays(next, -1), start: fromJst(first), end: fromJst(next) };
}
export function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export const monthLabel = (month: string) => `${Number(month.slice(0, 4))}年${Number(month.slice(5))}月`;

/** その月のクラスの曜日の日付（JSTの日付キー） */
function lessonDays(month: string, weekday: number) {
  const { first, last } = monthRange(month);
  const days: string[] = [];
  for (let k = first; k <= last; k = addDays(k, 1)) if (weekdayOf(k) === weekday) days.push(k);
  return days;
}

async function settings() {
  const s = await db.setting.findUnique({ where: { id: 1 } });
  return { admissionFee: s?.admissionFee ?? 0, leaveFee: s?.leaveFee ?? 0, prorate: s?.prorateMidMonth ?? true };
}

/** 会員のその月の請求明細を計算する */
export async function computeLines(memberId: string, month: string): Promise<Line[]> {
  const { start, end } = monthRange(month);
  const [cfg, enrollments, leaves, earlier] = await Promise.all([
    settings(),
    db.enrollment.findMany({
      where: { memberId, startDate: { lt: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] },
      include: { schoolClass: { include: { plan: true } }, plan: true },
      orderBy: { startDate: "asc" },
    }),
    db.leave.findMany({ where: { memberId, fromMonth: { lte: month }, toMonth: { gte: month } } }),
    db.enrollment.count({ where: { memberId, startDate: { lt: start } } }),
  ]);
  const lines: Line[] = [];
  if (leaves.length) {
    if (enrollments.length && cfg.leaveFee > 0) lines.push({ label: `休会費（${monthLabel(month)}）`, amount: cfg.leaveFee });
    return lines;
  }
  // 受講プランごとにまとめる（月8回＝週2クラスで1つのプラン、など）
  type Row = { plan: NonNullable<(typeof enrollments)[number]["plan"]>; names: string[]; covered: number; total: number };
  const groups = new Map<string, Row>();
  const monthDays = Math.round((end.getTime() - start.getTime()) / 86400_000);
  for (const e of enrollments) {
    const c = e.schoolClass;
    const plan = e.plan ?? c.plan;
    const free = plan?.freeMax != null;
    // フリーは日数、それ以外はその月のレッスン回数（曜日の数）で按分
    const days = free ? Array.from({ length: monthDays }, (_, i) => addDays(monthRange(month).first, i)) : lessonDays(month, c.weekday);
    const covered = days.filter((k) => enrollmentCovers(e, fromJst(k, free ? "12:00" : c.startTime))).length;
    if (covered === 0) continue;
    if (!plan) {
      lines.push({ label: `${c.name}（月謝未設定）`, amount: 0 });
      continue;
    }
    if (!plan.lessonsPerMonth && !free) {
      // 回数の決まっていないプラン：クラスごとに月謝
      const partial = covered < days.length;
      const amount = partial && cfg.prorate ? Math.round((plan.price * covered) / days.length / 10) * 10 : plan.price;
      lines.push({ label: `${c.name} 月謝${partial && cfg.prorate ? `（${covered}/${days.length}回）` : ""}`, amount });
      continue;
    }
    const g = groups.get(plan.id) ?? { plan, names: [], covered: 0, total: 0 };
    g.names.push(free ? `${c.name}（登録）` : c.name);
    g.covered += covered;
    g.total += days.length;
    groups.set(plan.id, g);
  }
  for (const g of groups.values()) {
    const free = g.plan.freeMax != null;
    const perUnit = free ? 1 : Math.max(1, Math.round((g.plan.lessonsPerMonth ?? 4) / 4)); // 1プランで受けられる週のクラス数
    const units = free ? 1 : Math.ceil(g.names.length / perUnit);
    const full = g.plan.price + (units - 1) * Math.max(0, g.plan.price - g.plan.extraDiscount);
    const partial = g.covered < g.total;
    const ratio = free ? g.covered / g.total : g.covered / g.total;
    const amount = partial && cfg.prorate ? Math.round((full * ratio) / 10) * 10 : full;
    const extra = units > 1 ? `・${units}クラス${g.plan.extraDiscount ? `（2クラス目から${g.plan.extraDiscount.toLocaleString()}円引き）` : ""}` : "";
    const pro = partial && cfg.prorate ? (free ? `（${g.covered}/${g.total}日）` : `（${g.covered}/${g.total}回）`) : "";
    lines.push({ label: `${g.plan.name}${extra}${pro}　${g.names.join("・")}`, amount });
  }
  // 入会金：この月より前に在籍がなく、この月に在籍が始まる
  if (cfg.admissionFee > 0 && earlier === 0 && enrollments.some((e) => e.startDate >= start)) {
    lines.unshift({ label: "入会金", amount: cfg.admissionFee });
  }
  return lines;
}

/** その月の請求を作成・更新する（未払いのみ。0円になった未払いは消す） */
export async function generateInvoices(month: string) {
  const { start, end } = monthRange(month);
  const ids = new Set<string>();
  (await db.enrollment.findMany({ where: { startDate: { lt: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] }, select: { memberId: true } })).forEach((e) => ids.add(e.memberId));
  (await db.invoice.findMany({ where: { month, status: "UNPAID" }, select: { memberId: true } })).forEach((i) => ids.add(i.memberId));
  let created = 0;
  let updated = 0;
  let removed = 0;
  let locked = 0;
  for (const memberId of ids) {
    const cur = await db.invoice.findUnique({ where: { memberId_month: { memberId, month } } });
    if (cur && cur.status !== "UNPAID") {
      locked++;
      continue;
    }
    const lines = await computeLines(memberId, month);
    const amount = lines.reduce((a, l) => a + l.amount, 0);
    if (!lines.length) {
      if (cur) {
        await db.invoice.delete({ where: { id: cur.id } });
        removed++;
      }
      continue;
    }
    const data = { amount, lines: lines as unknown as Prisma.InputJsonValue };
    if (cur) {
      if (cur.amount !== amount || JSON.stringify(cur.lines) !== JSON.stringify(lines)) {
        await db.invoice.update({ where: { id: cur.id }, data });
        updated++;
      }
    } else {
      await db.invoice.create({ data: { memberId, month, ...data } });
      created++;
    }
  }
  return { created, updated, removed, locked };
}
