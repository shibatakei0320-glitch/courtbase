import Link from "next/link";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { canManage, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { PAY_METHOD, fmtDate, yen } from "@/lib/format";
import { monthKey } from "@/lib/school";
import { isMonth, monthLabel, shiftMonth, type Line } from "@/lib/tuition";
import { generate, importDebitResult, markAllPaid, markPaid, undoPaid, voidInvoice } from "./actions";
import { debitSettings, debitTargets } from "@/lib/debit";
import { RESULT_LABEL } from "@/lib/zengin";

export const metadata = { title: "月謝" };
const FILTERS = { all: "すべて", UNPAID: "未入金", FAILED: "引落不能", CASH: "現金で集金", PAID: "入金済", VOID: "取消" } as const;

export default async function TuitionPage({ searchParams }: { searchParams: Promise<{ month?: string; f?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const month = sp.month && isMonth(sp.month) ? sp.month : shiftMonth(monthKey(new Date()), 1);
  const f = sp.f && sp.f in FILTERS ? (sp.f as keyof typeof FILTERS) : "all";
  const [all, unpriced] = await Promise.all([
    db.invoice.findMany({ where: { month }, include: { member: true }, orderBy: { member: { memberNo: "asc" } } }),
    db.schoolClass.count({ where: { active: true, planId: null } }),
  ]);
  const list =
    f === "all" ? all
    : f === "FAILED" ? all.filter((i) => i.status === "UNPAID" && i.debitResult && i.debitResult !== "0")
    : f === "CASH" ? all.filter((i) => i.status === "UNPAID" && (i.member.tuitionMethod !== "DEBIT" || (i.debitResult && i.debitResult !== "0")))
    : all.filter((i) => i.status === f);
  const [debit, debitCfg] = await Promise.all([debitTargets(month), debitSettings()]);
  const methodCount = (m: string) => all.filter((i) => i.status !== "VOID" && i.member.tuitionMethod === m).length;
  const sum = (s?: string) => all.filter((i) => (s ? i.status === s : i.status !== "VOID")).reduce((a, i) => a + i.amount, 0);
  const manage = canManage(me.role);

  return (
    <>
      <PageHeader
        title="月謝"
        actions={
          <div className="flex items-center gap-2">
            <Link className="btn-secondary btn-sm" href={`/tuition?month=${shiftMonth(month, -1)}`}>←</Link>
            <form className="flex gap-2"><input className="input py-1.5" type="month" name="month" defaultValue={month} /><button className="btn-secondary btn-sm">表示</button></form>
            <Link className="btn-secondary btn-sm" href={`/tuition?month=${shiftMonth(month, 1)}`}>→</Link>
          </div>
        }
      />
      {unpriced > 0 && <div className="card mb-4 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">月謝が未設定のクラスが{unpriced}件あります。<Link className="underline" href="/classes">クラス</Link>の設定で月謝（月額プラン）を選んでください。</div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label={`${monthLabel(month)} 請求`} value={`${all.filter((i) => i.status !== "VOID").length}件`} />
        <Stat label="請求額" value={yen(sum())} />
        <Stat label="入金済" value={yen(sum("PAID"))} />
        <Stat label="未入金" value={yen(sum("UNPAID"))} tone={sum("UNPAID") > 0 ? "text-red-700" : ""} />
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <nav className="mb-3 flex gap-1">
            {Object.entries(FILTERS).map(([k, v]) => (
              <Link key={k} href={`/tuition?month=${month}&f=${k}`} className={`rounded-full px-3 py-1 text-sm ${k === f ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>{v}</Link>
            ))}
          </nav>
          <div className="card overflow-x-auto">
            {list.length === 0 ? <Empty>{all.length === 0 ? "この月の請求はまだありません。右の「請求を作成・更新」で在籍から作成します" : "該当する請求はありません"}</Empty> : (
              <table className="table">
                <thead><tr><th>会員</th><th>払い方</th><th>明細</th><th className="text-right">金額</th><th>状態</th><th></th></tr></thead>
                <tbody>
                  {list.map((i) => (
                    <tr key={i.id} className={i.status === "VOID" ? "opacity-50" : ""}>
                      <td className="whitespace-nowrap"><Link className="text-brand-700 hover:underline" href={`/members/${i.memberId}`}>{i.member.lastName} {i.member.firstName}</Link></td>
                      <td className="whitespace-nowrap text-xs">{PAY_METHOD[i.member.tuitionMethod]}{i.debitSentAt && i.status === "UNPAID" && !i.debitResult && <span className="block text-slate-500">依頼済み・結果待ち</span>}</td>
                      <td className="text-xs text-slate-600">{(i.lines as Line[]).map((l, n) => <span key={n} className="block">{l.label}　{yen(l.amount)}</span>)}</td>
                      <td className="whitespace-nowrap text-right font-medium">{yen(i.amount)}</td>
                      <td className="whitespace-nowrap">{i.status === "PAID" ? <><Badge tone="green">入金済</Badge><span className="ml-1 text-xs text-slate-500">{fmtDate(i.paidAt)}</span></> : i.status === "VOID" ? <Badge>取消</Badge> : i.debitResult && i.debitResult !== "0" ? <span title={i.note ?? ""}><Badge tone="red">引落不能</Badge><span className="ml-1 text-xs text-red-700">{RESULT_LABEL[i.debitResult] ?? ""}</span></span> : <Badge tone="yellow">未入金</Badge>}</td>
                      <td>
                        {i.status === "UNPAID" ? (
                          <div className="flex items-center gap-1">
                            <ActionForm action={markPaid} className="flex gap-1">
                              <input type="hidden" name="id" value={i.id} />
                              <select className="input w-24 py-1 text-xs" name="method" defaultValue={i.member.tuitionMethod === "DEBIT" && i.debitResult && i.debitResult !== "0" ? "CASH" : i.member.tuitionMethod}>
                                {Object.entries(PAY_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                              </select>
                              <Submit className="btn-primary btn-sm whitespace-nowrap">入金済</Submit>
                            </ActionForm>
                            {manage && (
                              <ActionForm action={voidInvoice} confirm="この請求を取り消しますか？">
                                <input type="hidden" name="id" value={i.id} />
                                <Submit className="btn-secondary btn-sm">取消</Submit>
                              </ActionForm>
                            )}
                          </div>
                        ) : manage && (
                          <ActionForm action={undoPaid} confirm={i.status === "PAID" ? "未入金に戻しますか？（売上の記録も削除されます）" : "未入金に戻しますか？"}>
                            <input type="hidden" name="id" value={i.id} />
                            <Submit className="btn-secondary btn-sm whitespace-nowrap">未入金に戻す</Submit>
                          </ActionForm>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {manage && (
          <div className="space-y-4">
            <div className="card p-4">
              <h2 className="mb-2 font-semibold">請求を作成・更新</h2>
              <p className="mb-3 text-xs leading-relaxed text-slate-500">{monthLabel(month)}の在籍・休会から月謝を計算します。何度でも実行でき、未入金の請求だけが最新の在籍に合わせて更新されます。</p>
              <ActionForm action={generate}>
                <input type="hidden" name="month" value={month} />
                <Submit>{monthLabel(month)}の請求を作成</Submit>
              </ActionForm>
            </div>
            <div className="card p-4">
              <h2 className="mb-1 font-semibold">口座振替（{debitCfg.s?.debitBankName === "ﾔﾏｸﾞﾁ" ? "山口銀行" : "銀行"}）</h2>
              <p className="mb-3 text-xs text-slate-500">払い方：口座振替 {methodCount("DEBIT")}名・現金 {methodCount("CASH")}名・振込 {methodCount("TRANSFER")}名</p>
              {debitCfg.missing.length > 0 ? (
                <p className="text-xs leading-relaxed text-amber-800">施設設定で口座振替の情報を入力してください：{debitCfg.missing.join("、")}</p>
              ) : (
                <>
                  <p className="text-sm">依頼できる未入金：<b>{debit.ok.length}件</b>・{yen(debit.ok.reduce((a, i) => a + i.amount, 0))}</p>
                  {debit.ok.length > 0 && <a className="btn-primary mt-2 w-full" href={`/tuition/debit?month=${month}`}>① 依頼データをダウンロード</a>}
                </>
              )}
              {debit.problems.length > 0 && (
                <details className="mt-2 text-xs text-red-700">
                  <summary className="cursor-pointer">口座情報が足りない会員 {debit.problems.length}名</summary>
                  <ul className="mt-1 space-y-0.5">{debit.problems.map((p) => <li key={p.memberId}><Link className="underline" href={`/members/${p.memberId}`}>{p.name}</Link>：{p.reason}</li>)}</ul>
                </details>
              )}
              <ActionForm action={importDebitResult} className="mt-4 space-y-2 border-t pt-3">
                <p className="text-sm font-medium">② 銀行の結果データを取り込む</p>
                <input className="block w-full text-xs" type="file" name="file" required />
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="notify" defaultChecked />引き落とせなかった人にLINEで知らせる</label>
                <Submit className="btn-secondary btn-sm">取り込む</Submit>
              </ActionForm>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">全銀協フォーマット（120バイト・半角カナ）です。最初の1回は、銀行に送る前にテスト送信で形式を確認してください。振替済は入金済み（売上に記録）、振替不能は「引落不能」になり、現金で集金できます。</p>
            </div>
            <div className="card p-4">
              <h2 className="mb-2 font-semibold">まとめて入金済み</h2>
              <p className="mb-3 text-xs text-slate-500">振込の確認などで、未入金を一度に入金済みにします（引落不能の人は除きます）。</p>
              <ActionForm action={markAllPaid} className="space-y-2" confirm="未入金の請求をすべて入金済みにしますか？">
                <input type="hidden" name="month" value={month} />
                <select className="input" name="method" defaultValue="TRANSFER">
                  {Object.entries(PAY_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <Submit className="btn-secondary">未入金をすべて入金済みに</Submit>
              </ActionForm>
            </div>
            <a className="card block p-4 text-sm text-brand-700 hover:bg-slate-50" href={`/tuition/export?month=${month}`}>CSVでダウンロード →</a>
            <p className="px-1 text-xs leading-relaxed text-slate-500">入会金・休会費・月途中の按分は「施設設定」で変更できます。</p>
          </div>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className="card p-4"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 text-lg font-semibold ${tone}`}>{value}</p></div>;
}
