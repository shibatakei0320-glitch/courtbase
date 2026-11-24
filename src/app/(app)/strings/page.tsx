import Link from "next/link";
import type { Prisma, StringStatus } from "@prisma/client";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, fmtDate, jstDateKey, yen } from "@/lib/format";
import { createStringJob, updateStringJob } from "./actions";

export const metadata = { title: "ガット張替" };

const TABS: { key: StringStatus | "ALL"; label: string }[] = [
  { key: "RECEIVED", label: "受付中" },
  { key: "DONE", label: "仕上がり（お渡し待ち）" },
  { key: "DELIVERED", label: "お渡し済み" },
  { key: "ALL", label: "すべて" },
];

export default async function StringsPage({ searchParams }: { searchParams: Promise<{ s?: string; q?: string; member?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.s)?.key ?? "RECEIVED";
  const where: Prisma.StringJobWhereInput = tab === "ALL" ? {} : { status: tab };
  const [jobs, counts, selected, candidates] = await Promise.all([
    db.stringJob.findMany({ where, include: { member: true }, orderBy: tab === "DELIVERED" || tab === "ALL" ? { receivedAt: "desc" } : { receivedAt: "asc" }, take: 100 }),
    db.stringJob.groupBy({ by: ["status"], _count: true }),
    sp.member ? db.member.findUnique({ where: { id: sp.member }, include: { stringJobs: { orderBy: { receivedAt: "desc" }, take: 5 } } }) : null,
    sp.q
      ? db.member.findMany({
          where: { status: { not: "WITHDRAWN" }, OR: [{ lastName: { contains: sp.q } }, { firstName: { contains: sp.q } }, { lastKana: { contains: sp.q } }, { phone: { contains: sp.q } }, ...(Number.isInteger(Number(sp.q)) ? [{ memberNo: Number(sp.q) }] : [])] },
          take: 8,
        })
      : [],
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const last = selected?.stringJobs[0];
  const today = jstDateKey(new Date());

  return (
    <>
      <PageHeader title="ガット張替" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <nav className="flex flex-wrap gap-1">
            {TABS.map((t) => (
              <Link key={t.key} href={`/strings?s=${t.key}`} className={`rounded-full px-3 py-1 text-sm ${t.key === tab ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>
                {t.label}{t.key !== "ALL" && t.key !== "DELIVERED" && count(t.key) > 0 && <span className="ml-1 font-bold">{count(t.key)}</span>}
              </Link>
            ))}
          </nav>
          <div className="card overflow-x-auto">
            {jobs.length === 0 ? <Empty>該当する受付はありません</Empty> : (
              <table className="table">
                <thead><tr><th>お客さま</th><th>ラケット・ガット</th><th>受付・仕上がり予定</th><th className="text-right">料金</th><th>状態・操作</th></tr></thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className={j.status === "CANCELED" ? "opacity-50" : ""}>
                      <td className="whitespace-nowrap">{j.member ? <Link className="text-brand-700 hover:underline" href={`/members/${j.memberId}`}>{j.member.lastName} {j.member.firstName}</Link> : <span>{j.customer}<span className="ml-1 text-xs text-slate-400">会員外</span></span>}</td>
                      <td className="!whitespace-normal text-sm">
                        <span className="block font-medium">{j.racket}</span>
                        <span className="text-slate-600">{j.stringName}・{j.tension}</span>
                        {j.note && <span className="block text-xs text-slate-500">{j.note}</span>}
                      </td>
                      <td className="text-sm">{fmtDate(j.receivedAt).slice(5)}{j.dueAt && <span className={`block text-xs ${j.status === "RECEIVED" && j.dueAt < new Date() ? "font-bold text-red-700" : "text-slate-500"}`}>予定 {fmtDate(j.dueAt).slice(5)}</span>}</td>
                      <td className="text-right">{yen(j.price)}</td>
                      <td>
                        {j.status === "RECEIVED" && (
                          <div className="flex gap-1">
                            <Op id={j.id} op="done" label={j.member?.lineUserId ? "仕上がり（LINEで連絡）" : "仕上がり"} primary />
                            <Op id={j.id} op="cancel" label="取消" confirm="この受付を取り消しますか？" />
                          </div>
                        )}
                        {j.status === "DONE" && (
                          <ActionForm action={updateStringJob} className="flex items-center gap-1">
                            <input type="hidden" name="id" value={j.id} />
                            <input type="hidden" name="op" value="deliver" />
                            {j.price > 0 && (
                              <select className="input w-28 py-1 text-xs" name="method" defaultValue="CASH">
                                <option value="CASH">現金</option><option value="CARD">カード</option><option value="TRANSFER">振込</option><option value="LATER">あとで受け取る</option>
                              </select>
                            )}
                            <Submit className="btn-primary btn-sm whitespace-nowrap">お渡し</Submit>
                          </ActionForm>
                        )}
                        {j.status === "DELIVERED" && (
                          j.paymentId || j.price === 0 ? <Badge tone="green">お渡し済み</Badge> : (
                            <ActionForm action={updateStringJob} className="flex items-center gap-1">
                              <input type="hidden" name="id" value={j.id} />
                              <input type="hidden" name="op" value="pay" />
                              <Badge tone="yellow">未収</Badge>
                              <select className="input w-24 py-1 text-xs" name="method" defaultValue="CASH"><option value="CASH">現金</option><option value="CARD">カード</option><option value="TRANSFER">振込</option></select>
                              <Submit className="btn-secondary btn-sm">受領</Submit>
                            </ActionForm>
                          )
                        )}
                        {j.status === "CANCELED" && <Badge>取消</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 font-semibold">張り替えの受付</h2>
          {selected ? (
            <p className="mb-3 flex items-center justify-between text-sm">
              <span>会員：<b>{selected.lastName} {selected.firstName}</b></span>
              <Link className="text-xs text-brand-700 underline" href="/strings">変更</Link>
            </p>
          ) : (
            <>
              <form className="mb-2 flex gap-2">
                <input className="input" name="q" defaultValue={sp.q} placeholder="会員を検索（氏名・カナ・電話）" />
                <button className="btn-secondary">検索</button>
              </form>
              {sp.q && (
                <ul className="mb-3 space-y-1 text-sm">
                  {candidates.length === 0 && <li className="text-slate-500">該当する会員がいません</li>}
                  {candidates.map((m) => <li key={m.id}><Link className="text-brand-700 hover:underline" href={`/strings?member=${m.id}`}>{m.lastName} {m.firstName}</Link></li>)}
                </ul>
              )}
            </>
          )}
          <ActionForm action={createStringJob} className="space-y-3" resetOnSuccess={!selected}>
            {selected ? <input type="hidden" name="memberId" value={selected.id} /> : <label className="block"><span className="label">会員以外のお客さま（名前）</span><input className="input" name="customer" placeholder="会員を選ばない場合" /></label>}
            {last && <p className="rounded bg-brand-50 px-3 py-2 text-xs text-brand-700">前回（{fmtDate(last.receivedAt)}）と同じ内容を入れています</p>}
            <label className="block"><span className="label">ラケット（メーカー・モデル）</span><input className="input" name="racket" required defaultValue={last?.racket ?? ""} placeholder="YONEX EZONE 100" /></label>
            <label className="block"><span className="label">ガット</span><input className="input" name="stringName" required defaultValue={last?.stringName ?? ""} placeholder="POLYTOUR PRO 125" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="label">テンション（ポンド）</span><input className="input" name="tension" required defaultValue={last?.tension ?? ""} placeholder="48 / 46" /></label>
              <label className="block"><span className="label">料金（円）</span><input className="input" type="number" min={0} name="price" defaultValue={last?.price ?? 0} /></label>
            </div>
            <label className="block"><span className="label">仕上がり予定日</span><input className="input" type="date" name="dueAt" defaultValue={addDays(today, 3)} /></label>
            <label className="block"><span className="label">メモ</span><input className="input" name="note" placeholder="グリップ交換も・ロゴ入れ など" /></label>
            {selected && selected.stringJobs.length > 0 && (
              <details className="text-xs text-slate-600">
                <summary className="cursor-pointer">これまでの張り替え（{selected.stringJobs.length}件）</summary>
                <ul className="mt-1 space-y-0.5">{selected.stringJobs.map((j) => <li key={j.id}>{fmtDate(j.receivedAt)}　{j.racket}・{j.stringName}・{j.tension}</li>)}</ul>
              </details>
            )}
            <Submit>受け付ける</Submit>
          </ActionForm>
        </div>
      </div>
    </>
  );
}

function Op({ id, op, label, primary, confirm }: { id: string; op: string; label: string; primary?: boolean; confirm?: string }) {
  return (
    <ActionForm action={updateStringJob} confirm={confirm}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      <Submit className={`${primary ? "btn-primary" : "btn-secondary"} btn-sm whitespace-nowrap`}>{label}</Submit>
    </ActionForm>
  );
}
