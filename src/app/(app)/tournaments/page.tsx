import Link from "next/link";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { canManage, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, yen } from "@/lib/format";
import { TournamentForm } from "./TournamentForm";

export const metadata = { title: "協会・外部の大会" };

export default async function TournamentsPage({ searchParams }: { searchParams: Promise<{ past?: string }> }) {
  const me = await requireStaff();
  const { past } = await searchParams;
  const today = new Date(Date.now() - 86400_000);
  const list = await db.tournament.findMany({
    where: past ? { date: { lt: today } } : { date: { gte: today } },
    include: { entries: { select: { status: true, paymentId: true } } },
    orderBy: { date: past ? "desc" : "asc" },
    take: 100,
  });
  return (
    <>
      <PageHeader title="協会・外部の大会" actions={<Link className="btn-secondary" href={past ? "/tournaments" : "/tournaments?past=1"}>{past ? "これからの大会" : "終わった大会"}</Link>} />
      <p className="mb-4 text-sm text-slate-600">山口県テニス協会などが主催する大会への申込みを、会員から受け付けてまとめます。48K主催の大会・イベントは「スケジュール」で作成します。</p>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card overflow-x-auto lg:col-span-2">
          {list.length === 0 ? <Empty>{past ? "終わった大会はありません" : "登録されている大会はありません"}</Empty> : (
            <table className="table">
              <thead><tr><th>開催日</th><th>大会</th><th>締切</th><th>申込</th><th>参加費</th></tr></thead>
              <tbody>
                {list.map((t) => {
                  const act = t.entries.filter((e) => e.status !== "CANCELED");
                  const closed = t.entryDeadline && t.entryDeadline < new Date();
                  return (
                    <tr key={t.id}>
                      <td>{fmtDate(t.date)}</td>
                      <td className="!whitespace-normal"><Link className="font-medium text-brand-700 hover:underline" href={`/tournaments/${t.id}`}>{t.name}</Link><span className="block text-xs text-slate-500">{t.organizer}{t.venue ? `・${t.venue}` : ""}</span></td>
                      <td>{t.entryDeadline ? <>{fmtDate(t.entryDeadline).slice(5)}{closed && <span className="ml-1"><Badge>締切</Badge></span>}</> : "-"}</td>
                      <td>{act.length}件{act.some((e) => e.status === "ENTERED") && <span className="ml-1"><Badge tone="yellow">未提出あり</Badge></span>}</td>
                      <td>{t.fee > 0 ? `${yen(t.fee)}（未収 ${act.filter((e) => !e.paymentId).length}）` : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {canManage(me.role) && <div className="card p-5"><h2 className="mb-3 font-semibold">大会を登録</h2><TournamentForm /></div>}
      </div>
    </>
  );
}
