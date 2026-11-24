import Link from "next/link";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/member-auth";
import { ActionForm, Submit } from "@/components/ActionForm";
import { fmtDate, yen } from "@/lib/format";
import { familyOf } from "@/lib/family";
import { applyTournament, cancelTournamentEntry } from "../actions";
import { Chip, mdw, ui } from "../ui";

export const metadata = { title: "大会の申込み" };

export default async function MyTournaments() {
  const me = await requireMember();
  const fam = await familyOf(me);
  const famIds = fam.map((m) => m.id);
  const list = await db.tournament.findMany({
    where: { published: true, date: { gte: new Date(Date.now() - 86400_000) } },
    include: { entries: { where: { memberId: { in: famIds }, status: { not: "CANCELED" } }, include: { member: true } } },
    orderBy: { date: "asc" },
  });
  const input = "block w-full rounded-xl border-2 border-[#1A2420]/15 bg-white px-4 py-3 text-base focus:border-[#0B6B4F] focus:outline-none";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/my" className={`px-1 text-sm ${ui.link}`}>← マイページ</Link>
        <h1 className="px-1 text-2xl font-bold">大会の申込み</h1>
        <p className="px-1 text-base leading-relaxed text-[#5B6661]">協会などが主催する大会に、スクールがまとめて申し込みます。スクール主催の大会・イベントはマイページのホームから申し込めます。</p>
      </div>
      {list.length === 0 ? (
        <p className={`${ui.card} text-base text-[#5B6661]`}>いま申し込める大会はありません。</p>
      ) : (
        <ul className="space-y-4">
          {list.map((t) => {
            const closed = (t.entryDeadline && t.entryDeadline < new Date()) || t.date < new Date();
            return (
              <li key={t.id} className={ui.card}>
                <p className="text-sm text-[#5B6661]">{t.organizer}</p>
                <h2 className="text-lg font-bold leading-snug">{t.name}</h2>
                <p className="mt-1 text-base">{mdw(t.date)}{t.venue && `・${t.venue}`}</p>
                <p className="mt-1 text-sm text-[#5B6661]">{t.fee > 0 ? `参加費 ${yen(t.fee)}（受付でお支払い）` : "参加費なし"}{t.entryDeadline && `・締切 ${fmtDate(t.entryDeadline)}`}</p>
                {t.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{t.description}</p>}
                {t.entries.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {t.entries.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 rounded-xl bg-[#F4F6F3] px-3 py-2 text-sm">
                        <span>{fam.length > 1 && `${e.member.firstName}さん・`}{e.category}{e.partner && `（ペア：${e.partner}）`}</span>
                        <span className="flex items-center gap-2">
                          {e.status === "SUBMITTED" ? <Chip tone="ok">協会に申込済み</Chip> : <Chip tone="info">受付済み</Chip>}
                          {e.status === "ENTERED" && !closed && (
                            <ActionForm action={cancelTournamentEntry} confirm="この申込みを取り消しますか？">
                              <input type="hidden" name="id" value={e.id} />
                              <Submit className={`text-xs ${ui.link}`}>取消</Submit>
                            </ActionForm>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {closed ? (
                  <p className="mt-3 text-sm text-[#5B6661]">申込みは締め切りました。</p>
                ) : (
                  <details className="mt-4">
                    <summary className={`${ui.secondary} cursor-pointer list-none`}>申し込む</summary>
                    <ActionForm action={applyTournament} className="mt-3 space-y-3" resetOnSuccess>
                      <input type="hidden" name="tournamentId" value={t.id} />
                      {fam.length > 1 ? (
                        <label className="block"><span className="mb-1 block text-sm font-bold">出場する方</span>
                          <select className={input} name="memberId">{fam.map((m) => <option key={m.id} value={m.id}>{m.lastName} {m.firstName}</option>)}</select>
                        </label>
                      ) : <input type="hidden" name="memberId" value={me.id} />}
                      <label className="block"><span className="mb-1 block text-sm font-bold">種目</span>
                        <select className={input} name="category" required>{t.categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                      </label>
                      <label className="block"><span className="mb-1 block text-sm font-bold">ペアの方のお名前（ダブルス）</span><input className={input} name="partner" /></label>
                      <label className="block"><span className="mb-1 block text-sm font-bold">連絡事項（任意）</span><input className={input} name="note" /></label>
                      <Submit className={ui.primary}>申し込む</Submit>
                    </ActionForm>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
