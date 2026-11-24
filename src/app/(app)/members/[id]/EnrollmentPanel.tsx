import Link from "next/link";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtDate, jstDateKey } from "@/lib/format";
import { WEEKDAYS, coolOf, monthKey, schoolSettings, todayKey } from "@/lib/school";
import { shiftMonth } from "@/lib/tuition";
import { addLeave, endEnrollment, enroll, removeLeave, transferEnrollment, withdrawAll } from "../../classes/actions";

/** 会員詳細の「在籍管理」：入会（クラス追加）・クラス変更・退会・休会 */
export async function EnrollmentPanel({ memberId }: { memberId: string }) {
  const now = new Date();
  const today = todayKey();
  const [enrollments, leaves, classes, credits, invoices] = await Promise.all([
    db.enrollment.findMany({ where: { memberId }, include: { schoolClass: { include: { level: true, plan: true } }, plan: true }, orderBy: { startDate: "desc" } }),
    db.leave.findMany({ where: { memberId }, orderBy: { fromMonth: "desc" } }),
    db.schoolClass.findMany({ where: { active: true }, include: { plan: true, _count: { select: { enrollments: true } } }, orderBy: [{ weekday: "asc" }, { startTime: "asc" }] }),
    db.makeupCredit.count({ where: { memberId, status: "AVAILABLE", expiresAt: { gt: now } } }),
    db.invoice.findMany({ where: { memberId }, orderBy: { month: "desc" }, take: 6 }),
  ]);
  const current = enrollments.filter((e) => !e.endDate || e.endDate.getTime() + 86400_000 > now.getTime());
  const past = enrollments.filter((e) => !current.includes(e));
  const thisMonth = monthKey(now);
  const leaveNow = leaves.find((l) => l.fromMonth <= thisMonth && thisMonth <= l.toMonth);
  // プランごとに1回（月8回で2クラスなど）
  const planSet = new Map<string, number>();
  for (const e of current.filter((x) => x.startDate <= now)) {
    const p = e.plan ?? e.schoolClass.plan;
    if (p) planSet.set(p.id, p.price);
  }
  const monthly = [...planSet.values()].reduce((a, b) => a + b, 0);
  const plans = await db.plan.findMany({ where: { kind: "MONTHLY", active: true }, orderBy: { sortOrder: "asc" } });
  const settings = await schoolSettings();
  const cool = coolOf(now, settings.coolMonths);
  const label = (c: (typeof classes)[number]) => `${WEEKDAYS[c.weekday]} ${c.startTime} ${c.name}${c.plan ? `（¥${c.plan.price.toLocaleString()}）` : ""}`;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="card lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="font-semibold">在籍クラス</h2>
          <span className="text-sm text-slate-600">
            月謝 <b>¥{monthly.toLocaleString()}</b>／月{leaveNow && <span className="ml-2"><Badge tone="yellow">今月は休会中</Badge></span>}
          </span>
        </div>
        {current.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">在籍しているクラスはありません</p> : (
          <ul className="divide-y">
            {current.map((e) => (
              <li key={e.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <Link className="font-medium text-brand-700 hover:underline" href={`/classes/${e.classId}`}>{e.schoolClass.name}</Link>
                    <span className="ml-2 text-xs text-slate-500">{WEEKDAYS[e.schoolClass.weekday]} {e.schoolClass.startTime}{e.schoolClass.level && `・${e.schoolClass.level.name}`}・{(e.plan ?? e.schoolClass.plan)?.name ?? "月謝未設定"}{(e.plan ?? e.schoolClass.plan)?.freeMax ? "（会員ページから予約）" : ""}</span>
                  </span>
                  <span className="text-xs text-slate-500">{fmtDate(e.startDate)}〜{e.endDate ? `${fmtDate(e.endDate)}まで` : ""}{e.startDate > now && <span className="ml-1"><Badge tone="blue">開始前</Badge></span>}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <details className="relative">
                    <summary className="btn-secondary btn-sm cursor-pointer list-none">クラス変更</summary>
                    <div className="absolute left-0 z-10 mt-2 w-80 rounded-lg border bg-white p-4 shadow-lg">
                      <ActionForm action={transferEnrollment} className="space-y-2" confirm="クラスを変更しますか？">
                        <input type="hidden" name="id" value={e.id} />
                        <label className="block"><span className="label">変更先</span>
                          <select className="input" name="classId" required defaultValue="">
                            <option value="" disabled>選んでください</option>
                            {classes.filter((c) => c.id !== e.classId).map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
                          </select>
                        </label>
                        <label className="block"><span className="label">変更日（新しいクラスの初回以前）</span><input className="input" type="date" name="date" defaultValue={today} /></label>
                        <p className="text-xs text-slate-500">前日までで今のクラスを終え、変更日から新しいクラスに出席予定が入ります。月謝は日割り（回数按分）されます。</p>
                        <Submit className="btn-primary btn-sm">変更する</Submit>
                      </ActionForm>
                    </div>
                  </details>
                  <details className="relative">
                    <summary className="btn-secondary btn-sm cursor-pointer list-none">{e.endDate ? "最終日を変更" : "退会"}</summary>
                    <div className="absolute left-0 z-10 mt-2 w-72 rounded-lg border bg-white p-4 shadow-lg">
                      <ActionForm action={endEnrollment} className="space-y-2" confirm="この日を最終回として在籍を終了しますか？以降の出席予定は消えます">
                        <input type="hidden" name="id" value={e.id} />
                        <label className="block"><span className="label">最終日（この日のレッスンまで）</span><input className="input" type="date" name="endDate" defaultValue={e.endDate ? jstDateKey(e.endDate) : monthEnd(today)} /></label>
                        <Submit className="btn-danger btn-sm">在籍を終了</Submit>
                      </ActionForm>
                    </div>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t px-4 py-3">
          <ActionForm action={enroll} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="memberId" value={memberId} />
            <label className="block min-w-[14rem] flex-1"><span className="label">クラスを追加（入会・掛け持ち）</span>
              <select className="input" name="classId" required defaultValue="">
                <option value="" disabled>選んでください</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
              </select>
            </label>
            <label className="block min-w-[14rem] flex-1"><span className="label">受講プラン</span>
              <select className="input" name="planId" defaultValue="">
                <option value="">クラスの標準プラン</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}（¥{p.price.toLocaleString()}）</option>)}
              </select>
            </label>
            <label className="block"><span className="label">開始日</span><input className="input" type="date" name="startDate" defaultValue={today} /></label>
            <Submit className="btn-primary">追加</Submit>
            <p className="w-full text-xs text-slate-500">月8回は、週2クラスに同じプランで在籍登録します（月謝は1回分）。フリーは登録クラスを1つ選ぶと、そのクラスと下のレベルの回を会員が予約できます。</p>
          </ActionForm>
        </div>
        {past.length > 0 && (
          <details className="border-t px-4 py-3 text-sm">
            <summary className="cursor-pointer text-slate-500">過去の在籍（{past.length}件）</summary>
            <ul className="mt-2 space-y-1 text-slate-600">{past.map((e) => <li key={e.id}>{e.schoolClass.name}　{fmtDate(e.startDate)}〜{fmtDate(e.endDate)}</li>)}</ul>
          </details>
        )}
        {current.length > 0 && (
          <details className="border-t px-4 py-3 text-sm">
            <summary className="cursor-pointer text-red-700">スクールを退会（すべてのクラス）</summary>
            <ActionForm action={withdrawAll} className="mt-3 flex flex-wrap items-end gap-2" confirm="すべてのクラスの在籍を終了しますか？以降の出席予定は消えます">
              <input type="hidden" name="memberId" value={memberId} />
              <label className="block"><span className="label">最終日（この日のレッスンまで）</span><input className="input" type="date" name="endDate" defaultValue={cool ? cool.last : monthEnd(today)} /></label>
              <Submit className="btn-danger">退会の手続き</Submit>
            </ActionForm>
            <p className="mt-2 text-xs text-slate-500">{cool ? `クール制のため、退会はクールの終わり（${cool.label}は ${cool.last.replaceAll("-", "/")}）が原則です。` : ""}月謝は最終日の月まで。振替は在籍中のみ有効なので、最終日で失効します。</p>
          </details>
        )}
      </div>

      <div className="space-y-4">
        <div className="card p-4">
          <h2 className="mb-2 font-semibold">休会</h2>
          {leaves.length > 0 && (
            <ul className="mb-3 space-y-1 text-sm">
              {leaves.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2">
                  <span>{l.fromMonth}〜{l.toMonth}{l.reason && <span className="ml-1 text-xs text-slate-500">{l.reason}</span>}</span>
                  {l.toMonth >= thisMonth && (
                    <ActionForm action={removeLeave} confirm="この休会を取り消しますか？（出席予定が戻ります）">
                      <input type="hidden" name="id" value={l.id} />
                      <Submit className="text-xs text-red-700 underline">取消</Submit>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={addLeave} className="space-y-2" confirm="休会を登録しますか？期間中の出席予定は外れます">
            <input type="hidden" name="memberId" value={memberId} />
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="label">開始月</span><input className="input" type="month" name="fromMonth" defaultValue={shiftMonth(thisMonth, 1)} required /></label>
              <label className="block"><span className="label">終了月</span><input className="input" type="month" name="toMonth" defaultValue={shiftMonth(thisMonth, 1)} required /></label>
            </div>
            <input className="input" name="reason" placeholder="理由（任意）" />
            <Submit className="btn-secondary btn-sm">休会を登録</Submit>
          </ActionForm>
        </div>
        <div className="card p-4 text-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">振替</h2>
            <Link className="text-brand-700 hover:underline" href={`/makeups?f=all&member=${memberId}`}>{credits}回使えます →</Link>
          </div>
        </div>
        <div className="card p-4 text-sm">
          <h2 className="mb-2 font-semibold">月謝</h2>
          {invoices.length === 0 ? <p className="text-slate-500">請求はまだありません</p> : (
            <ul className="space-y-1">
              {invoices.map((i) => (
                <li key={i.id} className="flex justify-between gap-2">
                  <Link className="hover:underline" href={`/tuition?month=${i.month}`}>{i.month}</Link>
                  <span>¥{i.amount.toLocaleString()} {i.status === "PAID" ? <Badge tone="green">入金済</Badge> : i.status === "VOID" ? <Badge>取消</Badge> : <Badge tone="yellow">未入金</Badge>}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function monthEnd(dateKey: string) {
  const [y, m] = dateKey.split("-").map(Number);
  const next = `${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, "0")}-01`;
  const d = new Date(`${next}T00:00:00+09:00`).getTime() - 86400_000;
  return new Date(d + 9 * 3600_000).toISOString().slice(0, 10);
}
