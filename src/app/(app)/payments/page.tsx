import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Empty, PageHeader } from "@/components/ui";
import { canManage, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { PAY_METHOD, PLAN_KIND, addDays, fmtDateTime, fromJst, jstDateKey, yen } from "@/lib/format";
import { createPayment, deletePayment } from "./actions";

export const metadata = { title: "売上・入金" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; member?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const today = jstDateKey(new Date());
  const from = sp.from || today.slice(0, 8) + "01";
  const to = sp.to || today;
  const where: Prisma.PaymentWhereInput = { paidAt: { gte: fromJst(from), lt: fromJst(addDays(to, 1)) }, ...(sp.member ? { memberId: sp.member } : {}) };
  const [list, plans, member] = await Promise.all([
    db.payment.findMany({ where, include: { member: true, staff: { select: { name: true } } }, orderBy: { paidAt: "desc" }, take: 500 }),
    db.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    sp.member ? db.member.findUnique({ where: { id: sp.member } }) : null,
  ]);
  const total = list.reduce((s, p) => s + p.amount, 0);
  const byMethod = Object.keys(PAY_METHOD).map((k) => ({ k, sum: list.filter((p) => p.method === k).reduce((s, p) => s + p.amount, 0) }));
  return (
    <>
      <PageHeader title="売上・入金" />
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        {sp.member && <input type="hidden" name="member" value={sp.member} />}
        <label className="block"><span className="label">開始日</span><input className="input" type="date" name="from" defaultValue={from} /></label>
        <label className="block"><span className="label">終了日</span><input className="input" type="date" name="to" defaultValue={to} /></label>
        <button className="btn-primary">集計</button>
        {member && <span className="text-sm">会員: {member.lastName} {member.firstName} <Link className="text-brand-700" href="/payments">（解除）</Link></span>}
      </form>
      <div className="mb-6 grid gap-4 sm:grid-cols-5">
        <div className="card p-4 sm:col-span-1"><p className="text-xs text-slate-500">期間合計</p><p className="mt-1 text-xl font-bold">{yen(total)}</p><p className="text-xs text-slate-400">{list.length}件</p></div>
        {byMethod.map((m) => <div key={m.k} className="card p-4"><p className="text-xs text-slate-500">{PAY_METHOD[m.k as keyof typeof PAY_METHOD]}</p><p className="mt-1 text-lg font-semibold">{yen(m.sum)}</p></div>)}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card overflow-x-auto lg:col-span-2">
          {list.length === 0 ? <Empty>入金はありません</Empty> : (
            <table className="table">
              <thead><tr><th>日時</th><th>会員</th><th>内容</th><th>方法</th><th className="text-right">金額</th><th>担当</th>{canManage(me.role) && <th></th>}</tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td>{fmtDateTime(p.paidAt)}</td>
                    <td>{p.member ? <Link href={`/members/${p.member.id}`} className="text-brand-700 hover:underline">{p.member.lastName} {p.member.firstName}</Link> : "-"}</td>
                    <td>{p.description}</td>
                    <td>{PAY_METHOD[p.method]}</td>
                    <td className={`text-right ${p.amount < 0 ? "text-red-600" : ""}`}>{yen(p.amount)}</td>
                    <td>{p.staff?.name ?? "-"}</td>
                    {canManage(me.role) && (
                      <td><ActionForm action={deletePayment} confirm="この入金記録を削除しますか？"><input type="hidden" name="id" value={p.id} /><Submit className="btn-secondary btn-sm">削除</Submit></ActionForm></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div id="new" className="card h-fit p-5">
          <h2 className="mb-3 font-semibold">入金登録</h2>
          <ActionForm action={createPayment} className="space-y-3" resetOnSuccess>
            {member ? (
              <><input type="hidden" name="memberId" value={member.id} /><p className="text-sm">会員: <b>{member.lastName} {member.firstName}</b></p></>
            ) : <p className="text-xs text-slate-500">会員に紐づける場合は会員詳細の「入金登録」から開いてください。</p>}
            <label className="block"><span className="label">プラン</span>
              <select className="input" name="planId" defaultValue="">
                <option value="">指定なし</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}（{PLAN_KIND[p.kind]} {yen(p.price)}）</option>)}
              </select>
            </label>
            <label className="block"><span className="label">内容</span><input className="input" name="description" placeholder="空欄ならプラン名" /></label>
            <label className="block"><span className="label">金額(円)</span><input className="input" type="number" name="amount" required /></label>
            <label className="block"><span className="label">支払方法</span>
              <select className="input" name="method">{Object.entries(PAY_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            <label className="block"><span className="label">入金日</span><input className="input" type="date" name="paidAt" defaultValue={today} /></label>
            {member && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="grantTickets" defaultChecked />回数券ならチケットを付与</label>}
            <Submit>登録</Submit>
          </ActionForm>
        </div>
      </div>
    </>
  );
}
