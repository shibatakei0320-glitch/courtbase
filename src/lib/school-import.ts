import "server-only";
import type { ClassTarget } from "@prisma/client";
import { db } from "./db";
import { fromJst } from "./format";
import { applyHagi48k } from "./templates/hagi48k";
import { generateLessons, syncClassReservations, todayKey } from "./school";

/*
 * 「会費管理表」から会員・在籍・入金を取り込む（48K萩校）
 *
 * CSV の列：氏名, ヨミガナ, 対象（ジュニア/成人）, 現在の級, 曜日1, 時間1, 曜日2, 時間2, 形態（週1/週2/フリー）, 月会費,
 *          1月からのクラス1, 1月からのクラス2, 入金4月〜入金11月（M/D）, 確認事項
 * - 12月までは今のクラス（【〜12月】のクラスとして作る）、1月からはホームページの時間割のクラスに在籍
 * - 入金日のある月は、その月の月謝を「入金済み」として記録
 * 同じ会員・在籍・月謝はもう一度取り込んでも重複しない
 */

export type ImportRow = Record<string, string>;
export type ImportReport = {
  dryRun: boolean;
  members: { created: number; existing: number };
  classesCreated: string[];
  enrollCurrent: number;
  enrollJan: number;
  paid: { count: number; total: number };
  lessons: number;
  issues: { name: string; message: string }[];
};

const YEAR = 2026; // 会費管理表の年度（4月〜翌3月）
const MONTHS = [4, 5, 6, 7, 8, 9, 10, 11];
const WD: Record<string, number> = { 日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6 };
const JR_ACADEMY = ["スタンダード", "アドバンス", "プレーヤー"];
const CURRENT_END = `${YEAR}-12-31`;
const JAN_START = `${YEAR + 1}-01-01`;

/** CSV（BOM・引用符・改行入りの値に対応）→ 見出し付きの行 */
export function parseCsv(text: string): ImportRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const split = (full: string) => {
  const p = full.replace(/\s+/g, " ").replace(/　/g, " ").trim().split(" ");
  return p.length >= 2 ? [p[0], p.slice(1).join(" ")] : [full.trim(), ""];
};
const time = (t: string) => (/^\d{1,2}:\d{2}$/.test(t) ? t.padStart(5, "0") : /^\d{3,4}$/.test(t) ? `${t.padStart(4, "0").slice(0, 2)}:${t.padStart(4, "0").slice(2)}` : "");

/** 今のクラス（12月まで）の定義 */
function currentClassDef(target: ClassTarget, level: string, day: string, t: string) {
  const junior = target === "JUNIOR";
  const academy = junior && JR_ACADEMY.includes(level);
  const duration = level === "幼児" ? 50 : junior && level !== "プレーヤー" ? 60 : 80;
  return {
    name: `【〜12月】${junior ? "ジュニア" : "成人"} ${academy ? `アカデミー ${level}` : level}（${day}${t}）`,
    target,
    course: academy ? "ACADEMY" : "ENJOY",
    levelName: academy ? level : junior ? null : level === "プレーヤー" ? "成人プレーヤー" : level,
    weekday: WD[day],
    startTime: t,
    durationMin: duration,
  };
}

/** 受講プランの名前（48K萩校の受講プラン） */
function planName(target: ClassTarget, level: string, form: string, academyAdult = false) {
  if (target === "ADULT") return academyAdult ? "成人 アカデミー 月4回" : "成人 エンジョイ 月4回";
  if (!JR_ACADEMY.includes(level)) return "ジュニア エンジョイ 月4回";
  if (form === "フリー") return { スタンダード: "ジュニア アカデミー スタンダード フリー（月16回まで）", アドバンス: "ジュニア アカデミー アドバンス フリー（月32回まで）", プレーヤー: "ジュニア アカデミー プレーヤー フリー（月48回まで）" }[level]!;
  if (level === "スタンダード") return form === "週2" ? "ジュニア アカデミー スタンダード 月8回" : "ジュニア アカデミー スタンダード 月4回";
  return `ジュニア アカデミー ${level} 月8回`;
}

/** フリーの登録クラス（今のクラス） */
const FREE_HOME: Record<string, [string, string]> = { スタンダード: ["火", "17:00"], アドバンス: ["火", "18:00"], プレーヤー: ["火", "19:00"] };

export async function importSchoolMembers(rows: ImportRow[], opts: { dryRun: boolean; generate: boolean }): Promise<ImportReport> {
  const rep: ImportReport = { dryRun: opts.dryRun, members: { created: 0, existing: 0 }, classesCreated: [], enrollCurrent: 0, enrollJan: 0, paid: { count: 0, total: 0 }, lessons: 0, issues: [] };
  const issue = (name: string, message: string) => rep.issues.push({ name, message });

  // ホームページの時間割・受講プラン（なければ作る）
  if (!opts.dryRun) await applyHagi48k();
  const [plans, levels, courts, hpClasses] = await Promise.all([db.plan.findMany(), db.level.findMany(), db.court.findMany({ orderBy: { sortOrder: "asc" } }), db.schoolClass.findMany()]);
  const planId = (n: string) => plans.find((p) => p.name === n)?.id ?? null;
  const classCache = new Map(hpClasses.map((c) => [c.name, c]));
  const touched = new Set<string>();

  async function ensureLevel(name: string, rank: number) {
    let l = levels.find((x) => x.name === name);
    if (!l && !opts.dryRun) {
      l = await db.level.create({ data: { name, rank, color: "#94a3b8" } });
      levels.push(l);
    }
    return l?.id ?? null;
  }

  async function ensureCurrentClass(target: ClassTarget, level: string, day: string, t: string, form: string) {
    const def = currentClassDef(target, level, day, t);
    const hit = classCache.get(def.name);
    if (hit) return hit.id;
    if (!(day in WD) || !t) return null;
    rep.classesCreated.push(def.name);
    if (opts.dryRun) {
      classCache.set(def.name, { id: `dry:${def.name}` } as never);
      return `dry:${def.name}`;
    }
    const rank = { 初級: 1, 中級: 2, 上級: 3, 成人プレーヤー: 4, スタンダード: 1, アドバンス: 2, プレーヤー: 3 }[def.levelName ?? ""] ?? 1;
    const levelId = def.levelName ? await ensureLevel(def.levelName, rank) : null;
    // 同じ曜日・時間の【〜12月】クラスがあれば2面目に
    const [h, m] = t.split(":").map(Number);
    const start = h * 60 + m;
    const clash = [...classCache.values()].some((c) => c.name?.startsWith("【〜12月】") && c.weekday === def.weekday && (() => { const [ch, cm] = c.startTime.split(":").map(Number); const cs = ch * 60 + cm; return cs < start + def.durationMin && start < cs + c.durationMin && c.courtId === courts[0]?.id; })());
    const c = await db.schoolClass.create({
      data: {
        name: def.name, target, course: def.course, levelId, weekday: def.weekday, startTime: t, durationMin: def.durationMin,
        courtId: (clash ? courts[1] ?? courts[0] : courts[0]).id, capacity: 10, planId: planId(planName(target, level, form === "フリー" ? "週1" : form)),
        description: "2026年12月までのクラス（1月からはホームページの時間割）",
      },
    });
    classCache.set(def.name, c);
    return c.id;
  }

  for (const r of rows) {
    const full = r["氏名"];
    if (!full) continue;
    const target: ClassTarget = r["対象"] === "成人" ? "ADULT" : "JUNIOR";
    const level = r["現在の級"];
    const form = r["形態"] || "週1";
    const fee = Number((r["月会費"] || "0").replace(/[^\d]/g, ""));
    const [lastName, firstName] = split(full);
    const [lastKana, firstKana] = r["ヨミガナ"] ? split(r["ヨミガナ"]) : [null, null];
    if (r["確認事項"]) issue(full, r["確認事項"]);

    // 会員
    let member = await db.member.findFirst({ where: { lastName, firstName } });
    if (member) rep.members.existing++;
    else {
      rep.members.created++;
      if (!opts.dryRun)
        member = await db.member.create({ data: { lastName, firstName, lastKana: lastKana || null, firstKana: firstKana || null, note: "会費管理表（2026年）から取り込み", joinedAt: fromJst(`${YEAR}-04-01`) } });
    }
    const memberId = member?.id ?? `dry:${full}`;
    const paidMonths = MONTHS.filter((mm) => /^\d{1,2}\/\d{1,2}$/.test(r[`入金${mm}月`] ?? ""));
    if (member && paidMonths.length && !opts.dryRun) await db.member.update({ where: { id: member.id }, data: { tuitionMethod: "CASH" } });

    // 12月まで：今のクラス
    const slots: [string, string][] = [];
    if (form === "フリー" && FREE_HOME[level]) slots.push(FREE_HOME[level]);
    for (const i of [1, 2]) if (r[`曜日${i}`] && time(r[`時間${i}`])) slots.push([r[`曜日${i}`], time(r[`時間${i}`])]);
    if (!slots.length) issue(full, "今のクラス（曜日・時間）がないため、12月までの在籍は登録していません");
    for (const [day, t] of slots) {
      const classId = await ensureCurrentClass(target, level, day, t, form);
      if (!classId) continue;
      const pid = planId(planName(target, level, form));
      const exists = member && !classId.startsWith("dry:") ? await db.enrollment.findFirst({ where: { memberId: member.id, classId } }) : null;
      if (exists) continue;
      rep.enrollCurrent++;
      touched.add(classId);
      if (!opts.dryRun && member) await db.enrollment.create({ data: { memberId: member.id, classId, planId: pid, startDate: fromJst(`${YEAR}-04-01`), endDate: fromJst(CURRENT_END) } });
    }

    // 1月から：ホームページの時間割
    for (const key of ["1月からのクラス1", "1月からのクラス2"]) {
      const name = r[key];
      if (!name) continue;
      const c = classCache.get(name);
      if (!c && !opts.dryRun) { issue(full, `1月からのクラス「${name}」が見つかりません`); continue; }
      const academyAdult = target === "ADULT" && name.includes("アカデミー");
      const pid = planId(planName(target, level, form, academyAdult));
      if (c && member && !c.id.startsWith("dry:") && (await db.enrollment.findFirst({ where: { memberId: member.id, classId: c.id } }))) continue;
      rep.enrollJan++;
      if (c) touched.add(c.id);
      if (!opts.dryRun && member && c) await db.enrollment.create({ data: { memberId: member.id, classId: c.id, planId: pid, startDate: fromJst(JAN_START) } });
    }
    if (!r["1月からのクラス1"]) issue(full, "1月からのクラスが未定のため、1月からの在籍は登録していません");

    // 入金（4月〜11月）
    for (const mm of paidMonths) {
      const [pm, pd] = r[`入金${mm}月`].split("/").map(Number);
      const month = `${YEAR}-${String(mm).padStart(2, "0")}`;
      const paidAt = fromJst(`${YEAR}-${String(pm).padStart(2, "0")}-${String(pd).padStart(2, "0")}`, "12:00");
      if (member && (await db.invoice.findUnique({ where: { memberId_month: { memberId: member.id, month } } }))) continue;
      rep.paid.count++;
      rep.paid.total += fee;
      if (opts.dryRun || !member) continue;
      const p = await db.payment.create({ data: { memberId: member.id, amount: fee, method: "OTHER", description: `月謝 ${YEAR}年${mm}月（会費管理表から取り込み）`, paidAt } });
      await db.invoice.create({ data: { memberId: member.id, month, amount: fee, lines: [{ label: "会費（会費管理表から取り込み）", amount: fee }], status: "PAID", paidAt, paymentId: p.id } });
    }
    void memberId;
  }

  // レッスンの回：今のクラスは12月末まで、ホームページのクラスは冬クール（1〜3月）
  if (!opts.dryRun && opts.generate) {
    const today = todayKey();
    for (const c of await db.schoolClass.findMany({ where: { active: true } })) {
      const cur = c.name.startsWith("【〜12月】");
      const res = await generateLessons(c.id, cur ? today : JAN_START, cur ? CURRENT_END : `${YEAR + 1}-03-31`);
      rep.lessons += res.created;
    }
  } else if (!opts.dryRun) {
    for (const id of touched) await syncClassReservations(id);
  }
  return rep;
}
