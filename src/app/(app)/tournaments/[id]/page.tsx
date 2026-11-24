import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { canManage, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, yen } from "@/lib/format";
import { gradeLabel } from "@/lib/school";
import { TournamentForm } from "../TournamentForm";
import { addEntry, markSubmitted, updateEntry } from "../actions";

export const metadata = { title: "大会の申込み" };
const GENDER: Record<string, string> = { male: "男", female: "女", other: "" };

export default async function TournamentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const me = await requireStaff();
  const { id } = await params;
  const { q } = await searchParams;
  const t = await db.tournament.findUnique({ where: { id }, include: { entries: { include: { member: true }, orderBy: [{ category: "asc" }, { createdAt: "asc" }] } } });
  if (!t) notFound();
  const candidates = q
    ? await db.member.findMany({ where: { status: { not: "WITHDRAWN" }, OR: [{ lastName: { contains: q } }, { firstName: { contains: q } }, { lastKana: { contains: q } }, { phone: { contains: q } }] }, take: 8 })
    : [];
  const active = t.entries.filter((e) => e.status !== "CANCELED");
  const entered = active.filter((e) => e.status === "ENTERED").length;
  const noAssoc = active.filter((e) => !e.member.associationNo).length;

  return (
    <>
      <PageHeader title={t.name} back="/tournaments" actions={<a className="btn-secondary" href={`/tournaments/${t.id}/export`}>提出用CSV</a>} />
      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
        <span>{fmtDate(t.date)}</span><span>{t.organizer}</span>{t.venue && <span>{t.venue}</span>}
        <span>締切 {t.entryDeadline ? fmtDateTime(t.entryDeadline) : "なし"}</span>
        <span>参加費 {t.fee > 0 ? yen(t.fee) : "なし"}</span>
        {!t.published && <Badge>会員ページに非表示</Badge>}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {noAssoc > 0 && <p className="card border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">協会の登録番号がない申込者が{noAssoc}名います（会員詳細で入力できます）</p>}
          <div className="card overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <h2 className="font-semibold">エントリー {active.length}件</h2>
              {entered > 0 && canManage(me.role) && (
                <ActionForm action={markSubmitted} confirm={`申込み中の${entered}件を「協会に提出済み」にしますか？`}>
                  <input type="hidden" name="tournamentId" value={t.id} />
                  <Submit className="btn-secondary btn-sm">{entered}件を提出済みにする</Submit>
                </ActionForm>
              )}
            </div>
            {t.entries.length === 0 ? <Empty>まだ申込みはありません</Empty> : (
              <table className="table">
                <thead><tr><th>種目</th><th>会員</th><th>登録番号</th><th>ペア</th><th>参加費</th><th>状態</th></tr></thead>
                <tbody>
                  {t.entries.map((e) => (
                    <tr key={e.id} className={e.status === "CANCELED" ? "opacity-50" : ""}>
                      <td>{e.category}</td>
                      <td><Link className="text-brand-700 hover:underline" href={`/members/${e.memberId}`}>{e.member.lastName} {e.member.firstName}</Link><span className="ml-1 text-xs text-slate-500">{GENDER[e.member.gender ?? ""] ?? ""}{gradeLabel(e.member.birthDate) ? `・${gradeLabel(e.member.birthDate)}` : ""}</span></td>
                      <td>{e.member.associationNo ?? <span className="text-amber-700">未登録</span>}</td>
                      <td>{e.partner ?? "-"}</td>
                      <td>
                        {t.fee <= 0 ? "-" : e.paymentId ? <Badge tone="green">受領</Badge> : e.status !== "CANCELED" && (
                          <ActionForm action={updateEntry} className="flex gap-1">
                            <input type="hidden" name="id" value={e.id} />
                            <input type="hidden" name="op" value="pay" />
                            <select className="input w-20 py-1 text-xs" name="method" defaultValue="CASH"><option value="CASH">現金</option><option value="TRANSFER">振込</option><option value="CARD">カード</option></select>
                            <Submit className="btn-secondary btn-sm">受領</Submit>
                          </ActionForm>
                        )}
                      </td>
                      <td>
                        <ActionForm action={updateEntry} className="flex gap-1">
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="op" value="status" />
                          <select className="input w-28 py-1 text-xs" name="status" defaultValue={e.status}><option value="ENTERED">申込み</option><option value="SUBMITTED">協会に提出済み</option><option value="CANCELED">取消</option></select>
                          <Submit className="btn-secondary btn-sm">変更</Submit>
                        </ActionForm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="mb-3 font-semibold">申込みを追加（窓口・電話）</h2>
            <form className="flex gap-2"><input className="input" name="q" defaultValue={q} placeholder="氏名・カナ・電話" /><button className="btn-secondary">検索</button></form>
            {q && candidates.length === 0 && <p className="mt-2 text-sm text-slate-500">該当する会員がいません</p>}
            {candidates.map((m) => (
              <details key={m.id} className="mt-3 border-t pt-3">
                <summary className="cursor-pointer text-sm font-medium">{m.lastName} {m.firstName}{!m.associationNo && <span className="ml-1 text-xs text-amber-700">登録番号なし</span>}</summary>
                <ActionForm action={addEntry} className="mt-2 space-y-2">
                  <input type="hidden" name="tournamentId" value={t.id} />
                  <input type="hidden" name="memberId" value={m.id} />
                  <select className="input" name="category" required>{t.categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                  <input className="input" name="partner" placeholder="ペアの名前（ダブルス）" />
                  <Submit className="btn-primary btn-sm">追加</Submit>
                </ActionForm>
              </details>
            ))}
          </div>
          {canManage(me.role) && <div className="card p-5"><h2 className="mb-3 font-semibold">大会の情報</h2><TournamentForm t={t} /></div>}
        </div>
      </div>
    </>
  );
}
