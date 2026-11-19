import Link from "next/link";
import { notFound } from "next/navigation";
import type { Match } from "@prisma/client";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { canManage, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { FORMAT_LABEL, categoryLabel, entryName } from "@/lib/entry";
import { roundLabel, standings } from "@/lib/draw";
import { clearDraw, generateDraw, saveMatchResult, setDrawPublished } from "../../actions";

export const metadata = { title: "対戦表" };

export default async function DrawPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cat?: string }> }) {
  const me = await requireStaff();
  const { id } = await params;
  const { cat: catParam } = await searchParams;
  const slot = await db.slot.findUnique({
    where: { id },
    include: { categories: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  if (!slot || slot.categories.length === 0) notFound();
  const cat = slot.categories.find((c) => c.id === catParam) ?? slot.categories[0];
  const [entries, matches] = await Promise.all([
    db.reservation.findMany({ where: { categoryId: cat.id, status: { in: ["RESERVED", "ATTENDED"] } }, include: { member: true }, orderBy: { createdAt: "asc" } }),
    db.match.findMany({ where: { categoryId: cat.id }, orderBy: [{ stage: "asc" }, { groupName: "asc" }, { round: "asc" }, { position: "asc" }] }),
  ]);
  const allRes = await db.reservation.findMany({ where: { id: { in: matches.flatMap((m) => [m.entryAId, m.entryBId]).filter(Boolean) as string[] } }, include: { member: true } });
  const nameOf = new Map(allRes.map((r) => [r.id, entryName(r, `${r.member.lastName} ${r.member.firstName}`)]));
  const name = (rid: string | null) => (rid ? nameOf.get(rid) ?? "（取り消し）" : "");
  const manage = canManage(me.role);
  const ko = matches.filter((m) => m.stage === "KNOCKOUT");
  const lg = matches.filter((m) => m.stage === "LEAGUE");
  const groups = [...new Set(lg.map((m) => m.groupName ?? ""))];
  const totalRounds = Math.max(0, ...ko.map((m) => m.round));

  return (
    <>
      <PageHeader title={`${slot.title}　対戦表`} back={`/schedule/${slot.id}`} />
      <nav className="mb-6 flex flex-wrap gap-2">
        {slot.categories.map((c) => (
          <Link key={c.id} href={`/schedule/${slot.id}/draw?cat=${c.id}`} className={`rounded-full px-4 py-1.5 text-sm ${c.id === cat.id ? "bg-brand-600 text-white" : "border bg-white text-slate-700"}`}>
            {categoryLabel(c)}
          </Link>
        ))}
      </nav>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <h2 className="mb-1 font-semibold">{categoryLabel(cat)}<span className="ml-2 text-sm font-normal text-slate-500">{FORMAT_LABEL[cat.format]}・エントリー {entries.length}組</span></h2>
          {manage && (
            <ActionForm action={generateDraw} confirm={matches.length ? "今の対戦表と入力済みの結果を消して作り直しますか？" : undefined} className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="categoryId" value={cat.id} />
              <label className="block"><span className="label">形式</span>
                <select className="input" name="type" defaultValue="LEAGUE"><option value="LEAGUE">リーグ戦（総当たり）</option><option value="KNOCKOUT">トーナメント</option></select>
              </label>
              <label className="block w-28"><span className="label">グループ数</span><input className="input" type="number" name="groups" min={1} max={26} defaultValue={Math.max(1, Math.ceil(entries.length / 4))} /></label>
              <label className="block"><span className="label">組み合わせ</span>
                <select className="input" name="order" defaultValue="random"><option value="random">ランダム</option><option value="entry">申込順</option></select>
              </label>
              <Submit>{matches.length ? "作り直す" : "対戦表を作成"}</Submit>
            </ActionForm>
          )}
          <p className="mt-2 text-xs text-slate-500">グループ数はリーグ戦のときだけ使います。トーナメントで2のべき乗に足りない分は不戦勝になります。</p>
        </div>
        <div className="card space-y-3 p-4">
          <p className="text-sm">会員ページ：{cat.drawPublished ? <Badge tone="green">公開中</Badge> : <Badge>非公開</Badge>}</p>
          {manage && matches.length > 0 && (
            <>
              <ActionForm action={setDrawPublished}>
                <input type="hidden" name="categoryId" value={cat.id} />
                <input type="hidden" name="published" value={cat.drawPublished ? "" : "on"} />
                <Submit className="btn-secondary w-full">{cat.drawPublished ? "非公開にする" : "会員ページに公開する"}</Submit>
              </ActionForm>
              <ActionForm action={clearDraw} confirm="対戦表と結果を削除しますか？">
                <input type="hidden" name="categoryId" value={cat.id} />
                <Submit className="btn-secondary w-full text-red-700">対戦表を削除</Submit>
              </ActionForm>
            </>
          )}
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="card"><Empty>まだ対戦表がありません。エントリーが集まったら「対戦表を作成」を押してください。</Empty></div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => {
            const gm = lg.filter((m) => (m.groupName ?? "") === g);
            const ids = [...new Set(gm.flatMap((m) => [m.entryAId, m.entryBId]).filter(Boolean) as string[])];
            const table = standings(ids, gm);
            return (
              <div key={g} className="card">
                <h3 className="border-b px-4 py-3 font-semibold">グループ{g}</h3>
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead><tr><th>順位</th><th>エントリー</th><th>試合</th><th>勝</th><th>敗</th><th>セット差</th><th>得失点差</th></tr></thead>
                    <tbody>{table.map((s, i) => <tr key={s.id}><td>{i + 1}</td><td className="font-medium">{name(s.id)}</td><td>{s.played}</td><td>{s.wins}</td><td>{s.losses}</td><td>{s.setDiff}</td><td>{s.pointDiff}</td></tr>)}</tbody>
                  </table>
                </div>
                <div className="divide-y border-t">{gm.map((m) => <MatchRow key={m.id} m={m} name={name} label={`第${m.round}試合`} />)}</div>
              </div>
            );
          })}
          {ko.length > 0 && (
            <div className="card">
              <h3 className="border-b px-4 py-3 font-semibold">トーナメント</h3>
              {Array.from({ length: totalRounds }, (_, i) => i + 1).map((r) => (
                <div key={r} className="border-b last:border-b-0">
                  <p className="bg-slate-50 px-4 py-2 text-sm font-semibold">{roundLabel(r, totalRounds)}</p>
                  <div className="divide-y">{ko.filter((m) => m.round === r).map((m) => <MatchRow key={m.id} m={m} name={name} label={`${roundLabel(r, totalRounds)} ${m.position + 1}`} />)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="mt-4 text-xs text-slate-500">スコアは「11-7, 9-11, 11-5」のようにセットごとに入力すると、順位表のセット差・得失点差に反映されます。</p>
    </>
  );
}

function MatchRow({ m, name, label }: { m: Match; name: (id: string | null) => string; label: string }) {
  const ready = m.entryAId && m.entryBId;
  return (
    <ActionForm action={saveMatchResult} className="grid items-center gap-2 px-4 py-3 text-sm md:grid-cols-[7rem_1fr_auto]">
      <input type="hidden" name="matchId" value={m.id} />
      <span className="text-xs text-slate-500">{label}</span>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <label className={`flex items-center gap-2 rounded-md border px-3 py-2 ${m.winnerId && m.winnerId === m.entryAId ? "border-emerald-400 bg-emerald-50 font-semibold" : ""}`}>
          <input type="radio" name="winner" value="A" defaultChecked={!!m.winnerId && m.winnerId === m.entryAId} disabled={!ready} />
          {name(m.entryAId) || <span className="text-slate-400">未定</span>}
        </label>
        <span className="text-center text-xs text-slate-400">vs</span>
        <label className={`flex items-center gap-2 rounded-md border px-3 py-2 ${m.winnerId && m.winnerId === m.entryBId ? "border-emerald-400 bg-emerald-50 font-semibold" : ""}`}>
          <input type="radio" name="winner" value="B" defaultChecked={!!m.winnerId && m.winnerId === m.entryBId} disabled={!ready} />
          {name(m.entryBId) || <span className="text-slate-400">{m.round === 1 && m.stage === "KNOCKOUT" ? "不戦勝" : "未定"}</span>}
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-36" name="score" defaultValue={m.score ?? ""} placeholder="11-7, 11-9" disabled={!ready} />
        <input className="input w-20" name="court" defaultValue={m.court ?? ""} placeholder="コート" />
        <Submit className="btn-secondary btn-sm">保存</Submit>
      </div>
    </ActionForm>
  );
}
