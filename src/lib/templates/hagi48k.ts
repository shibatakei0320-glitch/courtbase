import "server-only";
import type { ClassTarget } from "@prisma/client";
import { db } from "../db";

/*
 * 48Kテニススクール 萩校の初期設定（48k-tennis.net/school の「コース・料金」「クラススケジュール」より）
 * - 目的別のコース：エンジョイ（楽しく上達）／アカデミー（試合・大会を目指す）
 * - アカデミーの段階：スタンダード < アドバンス < プレーヤー（成人はトーナメントも）
 * - 振替：登録クラスか1つ下のレベル。成人はコースをまたいで可。回数・期限の制限なし（在籍中のみ）
 * - 3か月1クール（12回）、退会はクールの終わり
 * 何度実行しても、同じ名前のものは作り直さない
 */

type Tier = "スタンダード" | "アドバンス" | "プレーヤー" | "トーナメント";
const TIERS: { name: Tier; rank: number; color: string }[] = [
  { name: "スタンダード", rank: 1, color: "#93c5fd" },
  { name: "アドバンス", rank: 2, color: "#3b82f6" },
  { name: "プレーヤー", rank: 3, color: "#1d4ed8" },
  { name: "トーナメント", rank: 4, color: "#1e3a8a" },
];

type PlanDef = { name: string; target: ClassTarget; course: "ENJOY" | "ACADEMY"; tier?: Tier; price: number; lessonsPerMonth?: number; freeMax?: number; extraDiscount?: number };
const PLANS: PlanDef[] = [
  { name: "ジュニア エンジョイ 月4回", target: "JUNIOR", course: "ENJOY", price: 6600, lessonsPerMonth: 4, extraDiscount: 2200 },
  { name: "ジュニア アカデミー スタンダード 月4回", target: "JUNIOR", course: "ACADEMY", tier: "スタンダード", price: 7700, lessonsPerMonth: 4 },
  { name: "ジュニア アカデミー スタンダード 月8回", target: "JUNIOR", course: "ACADEMY", tier: "スタンダード", price: 9900, lessonsPerMonth: 8 },
  { name: "ジュニア アカデミー スタンダード フリー（月16回まで）", target: "JUNIOR", course: "ACADEMY", tier: "スタンダード", price: 11000, freeMax: 16 },
  { name: "ジュニア アカデミー アドバンス 月8回", target: "JUNIOR", course: "ACADEMY", tier: "アドバンス", price: 12100, lessonsPerMonth: 8 },
  { name: "ジュニア アカデミー アドバンス フリー（月32回まで）", target: "JUNIOR", course: "ACADEMY", tier: "アドバンス", price: 15400, freeMax: 32 },
  { name: "ジュニア アカデミー プレーヤー 月8回", target: "JUNIOR", course: "ACADEMY", tier: "プレーヤー", price: 15400, lessonsPerMonth: 8 },
  { name: "ジュニア アカデミー プレーヤー フリー（月48回まで）", target: "JUNIOR", course: "ACADEMY", tier: "プレーヤー", price: 19800, freeMax: 48 },
  { name: "成人 エンジョイ 月4回", target: "ADULT", course: "ENJOY", price: 8800, lessonsPerMonth: 4 },
  { name: "成人 エンジョイ 月8回", target: "ADULT", course: "ENJOY", price: 15400, lessonsPerMonth: 8 },
  { name: "成人 アカデミー 月4回", target: "ADULT", course: "ACADEMY", price: 8800, lessonsPerMonth: 4 },
  { name: "成人 アカデミー 月8回", target: "ADULT", course: "ACADEMY", price: 15400, lessonsPerMonth: 8 },
];

type ClassDef = { day: number; time: string; min: number; target: ClassTarget; course: "ENJOY" | "ACADEMY"; tier?: Tier; court?: 1 | 2 };
const J = "JUNIOR" as const;
const A = "ADULT" as const;
const CLASSES: ClassDef[] = [
  // 火
  { day: 2, time: "17:00", min: 60, target: J, course: "ACADEMY", tier: "スタンダード" },
  { day: 2, time: "18:00", min: 60, target: J, course: "ACADEMY", tier: "アドバンス" },
  { day: 2, time: "19:00", min: 80, target: J, course: "ACADEMY", tier: "プレーヤー" },
  { day: 2, time: "20:30", min: 80, target: A, course: "ENJOY" },
  // 水
  { day: 3, time: "11:30", min: 80, target: A, course: "ENJOY" },
  { day: 3, time: "16:00", min: 60, target: J, course: "ENJOY" },
  { day: 3, time: "17:00", min: 60, target: J, course: "ACADEMY", tier: "スタンダード" },
  { day: 3, time: "18:00", min: 60, target: J, course: "ACADEMY", tier: "アドバンス" },
  { day: 3, time: "19:00", min: 80, target: J, course: "ACADEMY", tier: "プレーヤー" },
  { day: 3, time: "20:30", min: 80, target: A, course: "ACADEMY", tier: "プレーヤー" },
  // 金
  { day: 5, time: "11:30", min: 80, target: A, course: "ACADEMY", tier: "プレーヤー" },
  { day: 5, time: "13:00", min: 80, target: A, course: "ENJOY" },
  { day: 5, time: "16:00", min: 60, target: J, course: "ENJOY" },
  { day: 5, time: "17:00", min: 60, target: J, course: "ACADEMY", tier: "スタンダード" },
  { day: 5, time: "18:00", min: 60, target: J, course: "ACADEMY", tier: "アドバンス" },
  { day: 5, time: "19:00", min: 80, target: J, course: "ACADEMY", tier: "プレーヤー" },
  { day: 5, time: "20:30", min: 80, target: A, course: "ACADEMY", tier: "アドバンス" },
  // 土
  { day: 6, time: "14:00", min: 60, target: J, course: "ENJOY" },
  { day: 6, time: "15:00", min: 60, target: J, course: "ACADEMY", tier: "スタンダード" },
  { day: 6, time: "16:00", min: 80, target: A, course: "ENJOY", court: 1 },
  { day: 6, time: "16:00", min: 80, target: A, course: "ACADEMY", tier: "トーナメント", court: 2 },
  { day: 6, time: "17:30", min: 60, target: J, course: "ACADEMY", tier: "アドバンス" },
  { day: 6, time: "18:30", min: 80, target: J, course: "ACADEMY", tier: "プレーヤー" },
];

const WD = ["日", "月", "火", "水", "木", "金", "土"];
const className = (c: ClassDef) => `${c.target === "JUNIOR" ? "ジュニア" : "成人"} ${c.course === "ENJOY" ? "エンジョイ" : `アカデミー ${c.tier}`}（${WD[c.day]}${c.time}）`;

export async function applyHagi48k() {
  const result = { levels: 0, plans: 0, courts: 0, classes: 0 };
  // 段階（レベル）
  const levels = new Map<string, string>();
  for (const t of TIERS) {
    let l = await db.level.findFirst({ where: { name: t.name } });
    if (!l) {
      l = await db.level.create({ data: { name: t.name, rank: t.rank, color: t.color } });
      result.levels++;
    }
    levels.set(t.name, l.id);
  }
  // 受講プラン
  const plans: { def: PlanDef; id: string }[] = [];
  for (const [i, p] of PLANS.entries()) {
    let row = await db.plan.findFirst({ where: { name: p.name } });
    if (!row) {
      row = await db.plan.create({
        data: { name: p.name, kind: "MONTHLY", price: p.price, course: p.course, target: p.target, levelId: p.tier ? levels.get(p.tier) : null, lessonsPerMonth: p.lessonsPerMonth ?? null, freeMax: p.freeMax ?? null, extraDiscount: p.extraDiscount ?? 0, sortOrder: 100 + i },
      });
      result.plans++;
    }
    plans.push({ def: p, id: row.id });
  }
  // コート（萩中央公園テニスコート 2面）
  const courts = [];
  for (const name of ["萩中央公園 1面", "萩中央公園 2面"]) {
    let c = await db.court.findFirst({ where: { name } });
    if (!c) {
      c = await db.court.create({ data: { name, description: "萩中央公園テニスコート（山口県萩市大字江向552）", memberBookable: false, sortOrder: courts.length } });
      result.courts++;
    }
    courts.push(c);
  }
  // クラス（標準の月謝は、そのクラスで一番少ない回数のプラン）
  for (const c of CLASSES) {
    const name = className(c);
    if (await db.schoolClass.findFirst({ where: { name } })) continue;
    const candidates = plans.filter((p) => p.def.target === c.target && p.def.course === c.course && !p.def.freeMax && (c.target === "ADULT" || c.course === "ENJOY" || p.def.tier === c.tier));
    const plan = candidates.sort((a, b) => (a.def.lessonsPerMonth ?? 99) - (b.def.lessonsPerMonth ?? 99))[0];
    await db.schoolClass.create({
      data: {
        name,
        target: c.target,
        course: c.course,
        levelId: c.tier ? levels.get(c.tier) : null,
        weekday: c.day,
        startTime: c.time,
        durationMin: c.min,
        courtId: courts[(c.court ?? 1) - 1].id,
        capacity: 8,
        planId: plan?.id ?? null,
        description: c.course === "ENJOY" ? "楽しみながら上達したい方のクラス" : `試合・大会を目指すクラス（${c.tier}）`,
      },
    });
    result.classes++;
  }
  // スクールのルール
  await db.setting.upsert({
    where: { id: 1 },
    update: { makeupLevelRule: "ONE_BELOW", makeupValidDays: 0, makeupCrossCourse: true, coolMonths: 3, lessonsPerCool: 12 },
    create: { id: 1, makeupLevelRule: "ONE_BELOW", makeupValidDays: 0, makeupCrossCourse: true, coolMonths: 3, lessonsPerCool: 12 },
  });
  return result;
}
