import Link from "next/link";
import { Badge } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtDate, yen } from "@/lib/format";

const STR = { RECEIVED: "受付中", DONE: "仕上がり", DELIVERED: "お渡し済み", CANCELED: "取消" } as const;

/** ガット張替・大会の申込みの履歴 */
export async function ExtrasPanel({ memberId }: { memberId: string }) {
  const [jobs, entries] = await Promise.all([
    db.stringJob.findMany({ where: { memberId }, orderBy: { receivedAt: "desc" }, take: 6 }),
    db.tournamentEntry.findMany({ where: { memberId }, include: { tournament: true }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="card p-4 text-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">ガット張替</h2>
          <Link className="btn-secondary btn-sm" href={`/strings?member=${memberId}`}>{jobs.length ? "前回と同じで受付" : "受付"}</Link>
        </div>
        {jobs.length === 0 ? <p className="text-slate-500">記録はありません</p> : (
          <ul className="space-y-1">
            {jobs.map((j) => <li key={j.id} className="flex justify-between gap-2"><span>{fmtDate(j.receivedAt)}　{j.racket}・{j.stringName}・{j.tension}</span><span className="shrink-0 text-xs text-slate-500">{yen(j.price)} {STR[j.status]}</span></li>)}
          </ul>
        )}
      </div>
      <div className="card p-4 text-sm">
        <h2 className="mb-2 font-semibold">大会の申込み</h2>
        {entries.length === 0 ? <p className="text-slate-500">申込みはありません</p> : (
          <ul className="space-y-1">
            {entries.map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <Link className="text-brand-700 hover:underline" href={`/tournaments/${e.tournamentId}`}>{fmtDate(e.tournament.date)}　{e.tournament.name}（{e.category}）</Link>
                <span className="shrink-0">{e.status === "CANCELED" ? <Badge>取消</Badge> : e.status === "SUBMITTED" ? <Badge tone="green">提出済</Badge> : <Badge tone="yellow">申込</Badge>}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
