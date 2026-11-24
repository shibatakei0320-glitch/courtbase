import Link from "next/link";
import type { ClassTarget } from "@prisma/client";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { jstDateKey, yen } from "@/lib/format";
import { WEEKDAYS, gradeLabel, monthKey, todayKey } from "@/lib/school";
import { isMonth, monthLabel, monthRange, shiftMonth } from "@/lib/tuition";
import {
  addDirect,
  clearAll,
  deleteEnrollment,
  updateEnrollment,
} from "./actions";

export const metadata = { title: "在籍台帳" };

/** 会員種別（在籍のクラス・受講プランの 対象×コース） */
const KINDS = [
  {
    key: "JUNIOR_ACADEMY",
    label: "ジュニア アカデミー",
    target: "JUNIOR",
    course: "ACADEMY",
  },
  {
    key: "JUNIOR_ENJOY",
    label: "ジュニア エンジョイ",
    target: "JUNIOR",
    course: "ENJOY",
  },
  {
    key: "ADULT_ACADEMY",
    label: "成人 アカデミー",
    target: "ADULT",
    course: "ACADEMY",
  },
  {
    key: "ADULT_ENJOY",
    label: "成人 エンジョイ",
    target: "ADULT",
    course: "ENJOY",
  },
] as const;
type KindKey = (typeof KINDS)[number]["key"];
const kindOf = (target?: ClassTarget | null, course?: string | null) =>
  target && course ? (`${target}_${course}` as KindKey) : null;

export default async function EnrollmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; k?: string }>;
}) {
  const me = await requireStaff();
  const sp = await searchParams;
  const month = sp.month && isMonth(sp.month) ? sp.month : monthKey(new Date());
  const kind = KINDS.find((k) => k.key === sp.k);
  const { start, end } = monthRange(month);
  const [enrollments, leaves, classes, plans] = await Promise.all([
    db.enrollment.findMany({
      // その月に在籍している人と、その月より後に始まる人（修正できるように）
      where: { OR: [{ endDate: null }, { endDate: { gte: start } }] },
      include: {
        member: true,
        plan: true,
        schoolClass: { include: { plan: true, level: true } },
      },
      orderBy: [{ member: { lastKana: "asc" } }, { startDate: "asc" }],
    }),
    db.leave.findMany({
      where: { fromMonth: { lte: month }, toMonth: { gte: month } },
    }),
    db.schoolClass.findMany({
      where: { active: true },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    }),
    db.plan.findMany({
      where: { kind: "MONTHLY", active: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  const onLeave = new Set(leaves.map((l) => l.memberId));
  const kOf = (e: (typeof enrollments)[number]) =>
    kindOf(
      e.schoolClass?.target ?? e.plan?.target,
      e.schoolClass?.course ?? e.plan?.course,
    );
  const inKind = (k?: (typeof KINDS)[number]) =>
    enrollments.filter((e) => !k || kOf(e) === k.key);
  const shown = inKind(kind);
  const price = (e: (typeof enrollments)[number]) =>
    (e.plan ?? e.schoolClass?.plan)?.price ?? 0;
  const stats = (list: typeof enrollments) => {
    const active = list.filter((e) => e.startDate < end);
    const fee = new Map<string, number>();
    for (const e of active)
      if (!onLeave.has(e.memberId))
        fee.set(
          `${e.memberId}:${e.plan?.id ?? e.schoolClass?.planId}`,
          price(e),
        );
    return {
      members: new Set(active.map((e) => e.memberId)).size,
      fee: [...fee.values()].reduce((a, b) => a + b, 0),
    };
  };
  const classOpts = classes.filter(
    (c) => !kind || (c.target === kind.target && c.course === kind.course),
  );
  const planOpts = plans.filter(
    (p) =>
      !kind ||
      !p.course ||
      (p.target === kind.target && p.course === kind.course),
  );
  const q = (o: Record<string, string | undefined>) =>
    `/enrollments?${new URLSearchParams(Object.entries({ month, k: kind?.key, ...o }).filter(([, v]) => v) as [string, string][])}`;
  const cls = (c: (typeof classes)[number]) =>
    `${WEEKDAYS[c.weekday]} ${c.startTime} ${c.name}`;
  const unknown = enrollments.filter((e) => !kOf(e)).length;

  return (
    <>
      <PageHeader
        title="在籍台帳"
        actions={
          <div className="flex items-center gap-2">
            <Link
              className="btn-secondary btn-sm"
              href={q({ month: shiftMonth(month, -1) })}
            >
              ←
            </Link>
            <span className="text-sm font-medium">{monthLabel(month)}</span>
            <Link
              className="btn-secondary btn-sm"
              href={q({ month: shiftMonth(month, 1) })}
            >
              →
            </Link>
            <Link
              className="btn-secondary btn-sm"
              href={`/tuition?month=${month}`}
            >
              この月の月謝
            </Link>
          </div>
        }
      />

      <nav className="mb-4 grid gap-2 sm:grid-cols-5">
        {[undefined, ...KINDS].map((k) => {
          const s = stats(inKind(k));
          const active = (k?.key ?? "") === (kind?.key ?? "");
          return (
            <Link
              key={k?.key ?? "all"}
              href={q({ k: k?.key ?? "" })}
              className={`card block px-4 py-3 ${active ? "ring-2 ring-brand-500" : "hover:bg-slate-50"}`}
            >
              <span className="block text-xs text-slate-500">
                {k?.label ?? "すべて"}
              </span>
              <span className="block text-lg font-bold">{s.members}名</span>
              <span className="block text-xs text-slate-500">
                月謝 {yen(s.fee)}
              </span>
            </Link>
          );
        })}
      </nav>
      {unknown > 0 && !kind && (
        <p className="mb-3 text-xs text-amber-700">
          種別がわからない在籍が{unknown}
          件あります（クラスや受講プランにコースが設定されていない）。
        </p>
      )}

      <div className="card mb-6 p-4">
        <h2 className="mb-3 font-semibold">
          直接入力{kind ? `（${kind.label}）` : ""}
        </h2>
        <ActionForm
          action={addDirect}
          resetOnSuccess
          className="grid gap-3 md:grid-cols-6"
        >
          <label className="block">
            <span className="label">姓</span>
            <input className="input" name="lastName" />
          </label>
          <label className="block">
            <span className="label">名</span>
            <input className="input" name="firstName" />
          </label>
          <label className="block">
            <span className="label">セイ</span>
            <input className="input" name="lastKana" />
          </label>
          <label className="block">
            <span className="label">メイ</span>
            <input className="input" name="firstKana" />
          </label>
          <label className="block">
            <span className="label">生年月日</span>
            <input className="input" type="date" name="birthDate" />
          </label>
          <label className="block">
            <span className="label">電話</span>
            <input className="input" type="tel" name="phone" />
          </label>
          <label className="block md:col-span-2">
            <span className="label">クラス</span>
            <select className="input" name="classId" defaultValue="">
              <option value="">（なし：フリーコース）</option>
              {classOpts.map((c) => (
                <option key={c.id} value={c.id}>
                  {cls(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="label">受講プラン</span>
            <select className="input" name="planId" defaultValue="">
              <option value="">クラスの標準プラン</option>
              {planOpts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}（{yen(p.price)}）
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">開始日</span>
            <input
              className="input"
              type="date"
              name="startDate"
              defaultValue={todayKey()}
            />
          </label>
          <label className="block">
            <span className="label">払い方（新しい会員）</span>
            <select className="input" name="tuitionMethod" defaultValue="CASH">
              <option value="CASH">現金</option>
              <option value="DEBIT">口座振替</option>
              <option value="TRANSFER">振込</option>
            </select>
          </label>
          <div className="flex items-end justify-between gap-3 md:col-span-6">
            <p className="text-xs text-slate-500">
              同じ氏名の会員がいれば、その会員に在籍を追加します（いなければ新しい会員を登録）。週2クラスは、同じ受講プラン（月8回）で2回登録します。
            </p>
            <Submit>登録</Submit>
          </div>
        </ActionForm>
      </div>

      <div className="card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">
            {kind?.label ?? "すべて"}の在籍　{stats(shown).members}名
          </h2>
          <span className="text-xs text-slate-500">
            {monthLabel(month)}以降に在籍している人（修正したら「保存」）
          </span>
        </div>
        {shown.length === 0 ? (
          <Empty>在籍はありません</Empty>
        ) : (
          <ul className="divide-y">
            <li className="hidden grid-cols-[minmax(9rem,1.1fr)_minmax(12rem,2fr)_minmax(12rem,2fr)_8.5rem_8.5rem_auto] gap-2 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 lg:grid">
              <span>会員</span>
              <span>クラス</span>
              <span>受講プラン</span>
              <span>開始日</span>
              <span>最終日</span>
              <span />
            </li>
            {shown.map((e) => {
              const k = kOf(e);
              const rowClasses = classes.filter(
                (c) =>
                  !k || `${c.target}_${c.course}` === k || c.id === e.classId,
              );
              const rowPlans = plans.filter(
                (p) =>
                  !k ||
                  !p.course ||
                  `${p.target}_${p.course}` === k ||
                  p.id === e.planId,
              );
              return (
                <li
                  key={e.id}
                  className={`px-4 py-2 ${e.startDate >= end ? "bg-blue-50/40" : ""}`}
                >
                  <ActionForm
                    action={updateEnrollment}
                    className="flex flex-col gap-2 lg:grid lg:grid-cols-[minmax(9rem,1.1fr)_minmax(12rem,2fr)_minmax(12rem,2fr)_8.5rem_8.5rem_auto] lg:items-center [&>[role]]:col-span-full [&>[role]]:mb-0"
                  >
                    <span className="text-sm">
                      <Link
                        className="font-medium text-brand-700 hover:underline"
                        href={`/members/${e.memberId}`}
                      >
                        {e.member.lastName} {e.member.firstName}
                      </Link>
                      {gradeLabel(e.member.birthDate) && (
                        <span className="ml-1 text-xs text-slate-500">
                          {gradeLabel(e.member.birthDate)}
                        </span>
                      )}
                      {onLeave.has(e.memberId) && (
                        <span className="ml-1">
                          <Badge tone="yellow">休会</Badge>
                        </span>
                      )}
                      {!kind && k && (
                        <span className="block text-[11px] text-slate-500">
                          {KINDS.find((x) => x.key === k)?.label}
                        </span>
                      )}
                    </span>
                    <input type="hidden" name="id" value={e.id} />
                    <select
                      className="input py-1.5 text-sm"
                      name="classId"
                      defaultValue={e.classId ?? ""}
                    >
                      <option value="">（なし：フリーコース）</option>
                      {rowClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {cls(c)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="input py-1.5 text-sm"
                      name="planId"
                      defaultValue={e.planId ?? ""}
                    >
                      <option value="">クラスの標準プラン</option>
                      {rowPlans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}（{yen(p.price)}）
                        </option>
                      ))}
                    </select>
                    <input
                      className="input py-1.5 text-sm"
                      type="date"
                      name="startDate"
                      defaultValue={jstDateKey(e.startDate)}
                    />
                    <input
                      className="input py-1.5 text-sm"
                      type="date"
                      name="endDate"
                      defaultValue={e.endDate ? jstDateKey(e.endDate) : ""}
                    />
                    <span className="flex gap-1">
                      <Submit className="btn-primary btn-sm">保存</Submit>
                    </span>
                  </ActionForm>
                  <div className="mt-1 flex justify-end">
                    <ActionForm
                      action={deleteEnrollment}
                      confirm={`${e.member.lastName} ${e.member.firstName}さんのこの在籍を削除しますか？（これから先の出席予定も消えます。退会の場合は「最終日」を入れて保存してください）`}
                    >
                      <input type="hidden" name="id" value={e.id} />
                      <Submit className="text-xs text-red-700 underline">
                        削除
                      </Submit>
                    </ActionForm>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {me.role === "OWNER" && (
        <details className="card mt-8 border-red-200 p-4">
          <summary className="cursor-pointer font-semibold text-red-700">
            在籍台帳をすべて消去する
          </summary>
          <ActionForm
            action={clearAll}
            className="mt-3 space-y-3"
            confirm="在籍台帳をすべて消去します。元に戻せません。よろしいですか？"
          >
            <p className="text-sm text-slate-600">
              すべての在籍と、これから先の出席予定を消します（クラス・会員・振替・これまでの出欠は残ります）。入力し直すときに使います。
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="imported" />
              会費管理表から取り込んだ会員と、その月謝・入金の記録も消す
            </label>
            <label className="block max-w-xs">
              <span className="label">確認のため「消去」と入力</span>
              <input className="input" name="confirm" autoComplete="off" />
            </label>
            <Submit className="btn-danger">すべて消去</Submit>
          </ActionForm>
        </details>
      )}
      <p className="mt-4 text-xs text-slate-500">
        在籍の開始日・最終日は、そのまま月謝の計算に使われます（月の途中からは回数で按分）。
      </p>
    </>
  );
}
