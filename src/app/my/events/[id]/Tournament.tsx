import Link from "next/link";
import type { EventCategory, Member, Slot, Court, Program } from "@prisma/client";
import { db } from "@/lib/db";
import { ActionForm, Submit } from "@/components/ActionForm";
import { cancelDeadline } from "@/lib/booking";
import { FORMAT_LABEL, categoryLabel, currentPrice, entryName, entrySize, isEarly } from "@/lib/entry";
import { fmtDate, fmtDateTime, yen } from "@/lib/format";
import { roundLabel, standings } from "@/lib/draw";
import { applyEvent, cancelMyReservation, joinWaitlist, leaveWaitlist } from "../../actions";
import { Court as CourtLines, Fill, Notice, hm, jst } from "../../ui";

const field = "mt-1.5 block w-full border-0 border-b border-[#1A2420]/20 bg-transparent px-0 py-2 text-base text-[#1A2420] placeholder:text-[#1A2420]/30 focus:border-[#0B6B4F] focus:outline-none focus:ring-0";
const btn = "w-full rounded-xl bg-[#0B6B4F] px-5 py-3.5 text-sm font-bold text-white transition hover:bg-[#08553F] active:scale-[0.99] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B6B4F]";

type Props = {
  slot: Slot & { court: Court; program: Program | null };
  cats: EventCategory[];
  me: Member;
  flash: { paid?: string; entered?: string };
};

export async function Tournament({ slot, cats, me, flash }: Props) {
  const res = await db.reservation.findMany({
    where: { slotId: slot.id, status: { in: ["RESERVED", "ATTENDED"] } },
    orderBy: { createdAt: "asc" },
  });
  const mine = res.filter((r) => r.memberId === me.id);
  const [myWait, waitAll, matches, allEntries] = await Promise.all([
    db.waitlist.findMany({ where: { memberId: me.id, categoryId: { in: cats.map((c) => c.id) } } }),
    db.waitlist.findMany({ where: { categoryId: { in: cats.map((c) => c.id) } }, orderBy: { createdAt: "asc" }, select: { categoryId: true, memberId: true } }),
    db.match.findMany({ where: { categoryId: { in: cats.filter((c) => c.drawPublished).map((c) => c.id) } }, orderBy: [{ groupName: "asc" }, { round: "asc" }, { position: "asc" }] }),
    db.reservation.findMany({ where: { slotId: slot.id }, include: { member: { select: { lastName: true, firstName: true } } } }),
  ]);
  const nameOf = new Map(allEntries.map((r) => [r.id, entryName(r, `${r.member.lastName} ${r.member.firstName}`)]));
  const waitPos = (cid: string) => waitAll.filter((w) => w.categoryId === cid).findIndex((w) => w.memberId === me.id) + 1;
  const byCat = (id: string) => res.filter((r) => r.categoryId === id);
  const deadline = await cancelDeadline(slot.startsAt);
  const canCancel = Date.now() <= deadline.at.getTime();
  const paidMap = new Map(
    (await db.payment.findMany({ where: { reservationId: { in: mine.map((r) => r.id) }, refundedAt: null, amount: { gt: 0 } } })).map((p) => [p.reservationId, p.amount]),
  );
  const closed = slot.status !== "OPEN" || slot.startsAt <= new Date();
  const d = jst(slot.startsAt);
  const about = [slot.program?.description, slot.note].filter(Boolean).join("\n\n");
  const myName = `${me.lastName} ${me.firstName}`;

  return (
    <div className="space-y-8">
      <Link href="/my" className="inline-block px-1 text-xs text-[#1A2420]/55 hover:text-[#1A2420]">← 一覧へ</Link>

      <section className="relative overflow-hidden rounded-2xl bg-[#0B6B4F] px-6 pb-8 pt-7 text-white">
        <CourtLines className="-right-10 -top-16 h-[22rem] rotate-[-8deg]" />
        <div className="relative">
          <p className="font-display text-[4.5rem] font-medium leading-[0.85] tracking-tight">{d.m}.{String(d.d).padStart(2, "0")}</p>
          <p className="mt-3 text-sm text-white/70">{d.w}曜日　{hm(slot.startsAt)}–{hm(slot.endsAt)}　{slot.court.name}</p>
          <p className="mt-6 text-xs text-white/55">大会・イベント</p>
          <h1 className="mt-1 max-w-[17rem] text-2xl font-medium leading-snug">{slot.title}</h1>
        </div>
      </section>

      {flash.paid && <Notice>お支払いが完了しました。エントリーの反映まで数秒かかることがあります。表示されないときはページを再読み込みしてください。</Notice>}
      {flash.entered && <Notice>エントリーが完了しました。</Notice>}

      {about && <p className="whitespace-pre-wrap px-1 text-sm leading-[1.9] text-[#1A2420]/80">{about}</p>}

      {mine.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-sm font-bold">あなたのエントリー</h2>
          <ul className="divide-y divide-[#1A2420]/10 border-y border-[#1A2420]/10">
            {mine.map((r) => {
              const c = cats.find((x) => x.id === r.categoryId);
              const paid = paidMap.get(r.id);
              return (
                <li key={r.id} className="px-1 py-4">
                  <p className="text-xs text-[#1A2420]/55">{c ? categoryLabel(c) : "種目なし"}</p>
                  <p className="mt-0.5 font-medium">{entryName(r, myName)}</p>
                  {r.teamName && <p className="text-xs text-[#1A2420]/55">{r.players.join(" / ")}</p>}
                  {r.status === "RESERVED" && (canCancel ? (
                    <ActionForm action={cancelMyReservation} confirm="このエントリーを取り消しますか？" className="mt-3">
                      <input type="hidden" name="id" value={r.id} />
                      <Submit className="text-xs font-bold text-[#C2410C] underline underline-offset-4 disabled:opacity-60">
                        エントリーを取り消す{paid ? `（${yen(paid)}を返金）` : ""}
                      </Submit>
                    </ActionForm>
                  ) : (
                    <p className="mt-2 text-xs text-[#1A2420]/50">取り消しの期限（開始の{deadline.hours}時間前）を過ぎました。スクールにお問い合わせください。</p>
                  ))}
                </li>
              );
            })}
          </ul>
          {canCancel && <p className="mt-2 px-1 text-xs text-[#1A2420]/45">{fmtDateTime(deadline.at)}まで取り消しできます。</p>}
        </section>
      )}

      <section>
        <h2 className="mb-3 px-1 text-sm font-bold">種目</h2>
        <ul className="space-y-3">
          {cats.map((c) => {
            const taken = byCat(c.id).length;
            const left = c.capacity - taken;
            const entered = mine.some((r) => r.categoryId === c.id);
            return (
              <li key={c.id} className="rounded-2xl bg-white px-5 py-5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">{categoryLabel(c)}</p>
                  <p className="shrink-0 text-right font-display text-xl font-medium leading-none">
                    {isEarly(c) && c.price > currentPrice(c) && <span className="mr-2 text-sm text-[#1A2420]/35 line-through">{yen(c.price)}</span>}
                    {currentPrice(c) > 0 ? yen(currentPrice(c)) : "無料"}
                  </p>
                </div>
                {isEarly(c) && <p className="mt-1 text-xs font-bold text-[#0B6B4F]">早期割引 {fmtDate(c.earlyUntil)}まで</p>}
                <p className="mt-1 text-xs text-[#1A2420]/55">{FORMAT_LABEL[c.format]}{c.format === "TEAM" ? `（${entrySize(c)}名）` : ""}　参加費は1{c.format === "SINGLES" ? "名" : c.format === "DOUBLES" ? "ペア" : "チーム"}あたり</p>
                <div className="mt-3 flex items-center gap-3">
                  <span className="flex-1"><Fill taken={taken} capacity={c.capacity} /></span>
                  <span className={`shrink-0 text-xs ${entered ? "font-bold text-[#0B6B4F]" : left <= 0 ? "text-[#1A2420]/40" : left <= 3 ? "font-bold text-[#C2410C]" : "text-[#1A2420]/60"}`}>
                    {entered ? "エントリー済み" : left <= 0 ? "満員" : `残り${left}組`}
                  </span>
                </div>

                {!entered && !closed && left > 0 && (
                  <details className="group mt-4">
                    <summary className="flex cursor-pointer list-none items-center justify-center rounded-xl border border-[#0B6B4F] py-3 text-sm font-bold text-[#0B6B4F] group-open:hidden">この種目にエントリー</summary>
                    <ActionForm action={applyEvent} className="space-y-5">
                      <input type="hidden" name="slotId" value={slot.id} />
                      <input type="hidden" name="categoryId" value={c.id} />
                      {c.format === "TEAM" && (
                        <label className="block text-xs text-[#1A2420]/60">チーム名<input className={field} name="teamName" required maxLength={30} /></label>
                      )}
                      <p className="text-xs text-[#1A2420]/60">{c.format === "SINGLES" ? "選手" : "代表者"}：<span className="text-sm text-[#1A2420]">{myName}</span></p>
                      {c.format === "DOUBLES" && (
                        <label className="block text-xs text-[#1A2420]/60">パートナーの名前<input className={field} name="partner" required maxLength={30} placeholder="例：山田 太郎" /></label>
                      )}
                      {c.format === "TEAM" && Array.from({ length: entrySize(c) - 1 }, (_, i) => (
                        <label key={i} className="block text-xs text-[#1A2420]/60">メンバー{i + 2}の名前<input className={field} name={`player${i + 2}`} required maxLength={30} /></label>
                      ))}
                      <Submit className={btn}>{currentPrice(c) > 0 ? `カードで払ってエントリー（${yen(currentPrice(c))}）` : "エントリーする"}</Submit>
                    </ActionForm>
                  </details>
                )}

                {!entered && !closed && left <= 0 && (
                  myWait.some((w) => w.categoryId === c.id) ? (
                    <ActionForm action={leaveWaitlist} className="mt-4 flex items-center justify-between gap-3">
                      <input type="hidden" name="categoryId" value={c.id} />
                      <input type="hidden" name="slotId" value={slot.id} />
                      <span className="text-sm">キャンセル待ち {waitPos(c.id)}番目<span className="block text-xs text-[#1A2420]/50">空きが出たらLINEでお知らせします（先着順）</span></span>
                      <Submit className="shrink-0 text-xs text-[#1A2420]/55 underline underline-offset-4">取り消す</Submit>
                    </ActionForm>
                  ) : (
                    <ActionForm action={joinWaitlist} className="mt-4">
                      <input type="hidden" name="categoryId" value={c.id} />
                      <Submit className="w-full rounded-xl border border-[#1A2420]/25 py-3 text-sm font-bold text-[#1A2420]/75 hover:bg-[#1A2420]/5">キャンセル待ちに登録</Submit>
                    </ActionForm>
                  )
                )}

                {c.drawPublished && <DrawView matches={matches.filter((m) => m.categoryId === c.id)} nameOf={nameOf} />}

                {slot.publicEntries && byCat(c.id).length > 0 && (
                  <details className="mt-4 border-t border-[#1A2420]/10 pt-3">
                    <summary className="cursor-pointer text-xs text-[#1A2420]/60">エントリー一覧（{taken}組）</summary>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                      {byCat(c.id).map((r) => <li key={r.id}>{entryName(r)}</li>)}
                    </ol>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
        {closed && <p className="mt-3 px-1 text-sm text-[#1A2420]/55">エントリーの受付は終了しました。</p>}
      </section>
    </div>
  );
}

type M = { id: string; stage: string; groupName: string | null; round: number; position: number; entryAId: string | null; entryBId: string | null; winnerId: string | null; score: string | null; court: string | null };

function DrawView({ matches, nameOf }: { matches: M[]; nameOf: Map<string, string> }) {
  if (!matches.length) return null;
  const nm = (id: string | null) => (id ? nameOf.get(id) ?? "" : "");
  const lg = matches.filter((m) => m.stage === "LEAGUE");
  const ko = matches.filter((m) => m.stage === "KNOCKOUT");
  const groups = [...new Set(lg.map((m) => m.groupName ?? ""))];
  const total = Math.max(0, ...ko.map((m) => m.round));
  const Row = ({ m }: { m: M }) => (
    <li className="py-2.5 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className={m.winnerId && m.winnerId === m.entryAId ? "font-bold" : ""}>{nm(m.entryAId) || "未定"}</span>
        <span className="shrink-0 font-display text-base text-[#1A2420]/60">{m.score ?? "vs"}</span>
        <span className={`text-right ${m.winnerId && m.winnerId === m.entryBId ? "font-bold" : ""}`}>{nm(m.entryBId) || (m.stage === "KNOCKOUT" && m.round === 1 ? "—" : "未定")}</span>
      </div>
      {m.court && <p className="mt-0.5 text-center text-[11px] text-[#1A2420]/45">コート {m.court}</p>}
    </li>
  );
  return (
    <details className="mt-4 border-t border-[#1A2420]/10 pt-3" open>
      <summary className="cursor-pointer text-xs font-bold text-[#0B6B4F]">対戦表・結果</summary>
      {groups.map((g) => {
        const gm = lg.filter((m) => (m.groupName ?? "") === g);
        const ids = [...new Set(gm.flatMap((m) => [m.entryAId, m.entryBId]).filter(Boolean) as string[])];
        return (
          <div key={g} className="mt-3">
            <p className="text-xs text-[#1A2420]/55">グループ{g}</p>
            <ol className="mt-1 divide-y divide-[#1A2420]/10 border-y border-[#1A2420]/10 text-sm">
              {standings(ids, gm).map((s, i) => (
                <li key={s.id} className="flex items-center gap-3 py-2">
                  <span className="w-5 font-display text-base text-[#0B6B4F]">{i + 1}</span>
                  <span className="flex-1">{nm(s.id)}</span>
                  <span className="text-xs text-[#1A2420]/55">{s.wins}勝{s.losses}敗</span>
                </li>
              ))}
            </ol>
            <ul className="mt-2 divide-y divide-[#1A2420]/5">{gm.map((m) => <Row key={m.id} m={m} />)}</ul>
          </div>
        );
      })}
      {Array.from({ length: total }, (_, i) => i + 1).map((r) => (
        <div key={r} className="mt-3">
          <p className="text-xs text-[#1A2420]/55">{roundLabel(r, total)}</p>
          <ul className="divide-y divide-[#1A2420]/5">{ko.filter((m) => m.round === r).map((m) => <Row key={m.id} m={m} />)}</ul>
        </div>
      ))}
    </details>
  );
}
