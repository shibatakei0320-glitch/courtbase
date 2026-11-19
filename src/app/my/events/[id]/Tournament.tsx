import Link from "next/link";
import type { EventCategory, Member, Slot, Court, Program } from "@prisma/client";
import { db } from "@/lib/db";
import { ActionForm, Submit } from "@/components/ActionForm";
import { cancelDeadline } from "@/lib/booking";
import { FORMAT_LABEL, categoryLabel, entryName, entrySize } from "@/lib/entry";
import { fmtDateTime, yen } from "@/lib/format";
import { applyEvent, cancelMyReservation } from "../../actions";
import { Court as CourtLines, Fill, Notice, hm, jst } from "../../ui";

const field = "mt-1.5 block w-full border-0 border-b border-[#13201A]/20 bg-transparent px-0 py-2 text-base text-[#13201A] placeholder:text-[#13201A]/30 focus:border-[#0F3D2E] focus:outline-none focus:ring-0";
const btn = "w-full rounded-xl bg-[#0F3D2E] px-5 py-3.5 text-sm font-bold text-white transition hover:bg-[#0B2F23] active:scale-[0.99] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F3D2E]";

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
      <Link href="/my" className="inline-block px-1 text-xs text-[#13201A]/55 hover:text-[#13201A]">← 一覧へ</Link>

      <section className="relative overflow-hidden rounded-2xl bg-[#0F3D2E] px-6 pb-8 pt-7 text-white">
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

      {about && <p className="whitespace-pre-wrap px-1 text-sm leading-[1.9] text-[#13201A]/80">{about}</p>}

      {mine.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-sm font-bold">あなたのエントリー</h2>
          <ul className="divide-y divide-[#13201A]/10 border-y border-[#13201A]/10">
            {mine.map((r) => {
              const c = cats.find((x) => x.id === r.categoryId);
              const paid = paidMap.get(r.id);
              return (
                <li key={r.id} className="px-1 py-4">
                  <p className="text-xs text-[#13201A]/55">{c ? categoryLabel(c) : "種目なし"}</p>
                  <p className="mt-0.5 font-medium">{entryName(r, myName)}</p>
                  {r.teamName && <p className="text-xs text-[#13201A]/55">{r.players.join(" / ")}</p>}
                  {r.status === "RESERVED" && (canCancel ? (
                    <ActionForm action={cancelMyReservation} confirm="このエントリーを取り消しますか？" className="mt-3">
                      <input type="hidden" name="id" value={r.id} />
                      <Submit className="text-xs font-bold text-[#B4371F] underline underline-offset-4 disabled:opacity-60">
                        エントリーを取り消す{paid ? `（${yen(paid)}を返金）` : ""}
                      </Submit>
                    </ActionForm>
                  ) : (
                    <p className="mt-2 text-xs text-[#13201A]/50">取り消しの期限（開始の{deadline.hours}時間前）を過ぎました。施設スタッフにお問い合わせください。</p>
                  ))}
                </li>
              );
            })}
          </ul>
          {canCancel && <p className="mt-2 px-1 text-xs text-[#13201A]/45">{fmtDateTime(deadline.at)}まで取り消しできます。</p>}
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
                  <p className="shrink-0 font-display text-xl font-medium leading-none">{c.price > 0 ? yen(c.price) : "無料"}</p>
                </div>
                <p className="mt-1 text-xs text-[#13201A]/55">{FORMAT_LABEL[c.format]}{c.format === "TEAM" ? `（${entrySize(c)}名）` : ""}　参加費は1{c.format === "SINGLES" ? "名" : c.format === "DOUBLES" ? "ペア" : "チーム"}あたり</p>
                <div className="mt-3 flex items-center gap-3">
                  <span className="flex-1"><Fill taken={taken} capacity={c.capacity} /></span>
                  <span className={`shrink-0 text-xs ${entered ? "font-bold text-[#0F3D2E]" : left <= 0 ? "text-[#13201A]/40" : left <= 3 ? "font-bold text-[#B4371F]" : "text-[#13201A]/60"}`}>
                    {entered ? "エントリー済み" : left <= 0 ? "満員" : `残り${left}組`}
                  </span>
                </div>

                {!entered && !closed && left > 0 && (
                  <details className="group mt-4">
                    <summary className="flex cursor-pointer list-none items-center justify-center rounded-xl border border-[#0F3D2E] py-3 text-sm font-bold text-[#0F3D2E] group-open:hidden">この種目にエントリー</summary>
                    <ActionForm action={applyEvent} className="space-y-5">
                      <input type="hidden" name="slotId" value={slot.id} />
                      <input type="hidden" name="categoryId" value={c.id} />
                      {c.format === "TEAM" && (
                        <label className="block text-xs text-[#13201A]/60">チーム名<input className={field} name="teamName" required maxLength={30} /></label>
                      )}
                      <p className="text-xs text-[#13201A]/60">{c.format === "SINGLES" ? "選手" : "代表者"}：<span className="text-sm text-[#13201A]">{myName}</span></p>
                      {c.format === "DOUBLES" && (
                        <label className="block text-xs text-[#13201A]/60">パートナーの名前<input className={field} name="partner" required maxLength={30} placeholder="例：山田 太郎" /></label>
                      )}
                      {c.format === "TEAM" && Array.from({ length: entrySize(c) - 1 }, (_, i) => (
                        <label key={i} className="block text-xs text-[#13201A]/60">メンバー{i + 2}の名前<input className={field} name={`player${i + 2}`} required maxLength={30} /></label>
                      ))}
                      <Submit className={btn}>{c.price > 0 ? `カードで払ってエントリー（${yen(c.price)}）` : "エントリーする"}</Submit>
                    </ActionForm>
                  </details>
                )}

                {slot.publicEntries && byCat(c.id).length > 0 && (
                  <details className="mt-4 border-t border-[#13201A]/10 pt-3">
                    <summary className="cursor-pointer text-xs text-[#13201A]/60">エントリー一覧（{taken}組）</summary>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                      {byCat(c.id).map((r) => <li key={r.id}>{entryName(r)}</li>)}
                    </ol>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
        {closed && <p className="mt-3 px-1 text-sm text-[#13201A]/55">エントリーの受付は終了しました。</p>}
      </section>
    </div>
  );
}
