import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/member-auth";
import { ActionForm, Submit } from "@/components/ActionForm";
import { yen } from "@/lib/format";
import { applyEvent } from "../../actions";
import { CourtLines, Spots, hm, jst } from "../../ui";

export const metadata = { title: "大会・イベント" };

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMember();
  const { id } = await params;
  const slot = await db.slot.findUnique({ where: { id }, include: { court: true, program: true } });
  if (!slot || slot.kind !== "EVENT") notFound();
  const [taken, mine] = await Promise.all([
    db.reservation.count({ where: { slotId: id, status: { in: ["RESERVED", "ATTENDED"] } } }),
    db.reservation.findFirst({ where: { slotId: id, memberId: me.id, status: { in: ["RESERVED", "ATTENDED"] } } }),
  ]);
  const left = Math.max(0, slot.capacity - taken);
  const closed = slot.status !== "OPEN" || slot.startsAt <= new Date();
  const d = jst(slot.startsAt);
  const about = [slot.program?.description, slot.note].filter(Boolean).join("\n\n");

  return (
    <div className="space-y-5">
      <Link href="/my" className="inline-block px-1 text-sm text-[#111C3A]/60 hover:text-[#111C3A]">← 一覧へ戻る</Link>

      <section className="relative overflow-hidden rounded-[2rem] bg-[#1E47B8] px-6 pb-7 pt-6 text-white">
        <CourtLines />
        <div className="relative">
          <p className="font-display text-[3.25rem] leading-none tracking-tight">
            {d.m}/{d.d}
            <span className="ml-2 align-middle text-2xl text-[#D9F24A]">{d.w}</span>
          </p>
          <p className="mt-2 text-sm text-white/80">{hm(slot.startsAt)}〜{hm(slot.endsAt)}</p>
          <h1 className="mt-4 text-2xl font-bold leading-snug">{slot.title}</h1>
        </div>
      </section>

      <dl className="divide-y divide-[#EEF2F8] rounded-3xl bg-white px-5 text-sm">
        <div className="flex justify-between gap-4 py-3.5"><dt className="text-[#111C3A]/60">場所</dt><dd className="font-bold">{slot.court.name}</dd></div>
        <div className="flex justify-between gap-4 py-3.5"><dt className="text-[#111C3A]/60">参加費</dt><dd className="font-display text-lg leading-none">{slot.price > 0 ? yen(slot.price) : "無料"}</dd></div>
        <div className="py-3.5">
          <div className="flex justify-between gap-4"><dt className="text-[#111C3A]/60">定員</dt><dd className="font-bold">{slot.capacity}名中 <span className={left <= 3 && left > 0 ? "text-rose-600" : ""}>残り{left}名</span></dd></div>
          <div className="mt-2.5"><Spots taken={taken} capacity={slot.capacity} /></div>
        </div>
      </dl>

      {about && <p className="whitespace-pre-wrap rounded-3xl bg-white px-5 py-4 text-sm leading-relaxed">{about}</p>}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[#111C3A]/5 bg-[#EEF2F8]/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-xl">
          {mine ? (
            <p className="rounded-full bg-[#D9F24A] py-4 text-center font-bold">申込み済みです。当日お待ちしています</p>
          ) : closed ? (
            <p className="rounded-full bg-white py-4 text-center font-bold text-[#111C3A]/50">受付は終了しました</p>
          ) : left <= 0 ? (
            <p className="rounded-full bg-white py-4 text-center font-bold text-[#111C3A]/50">満員になりました</p>
          ) : (
            <ActionForm action={applyEvent}>
              <input type="hidden" name="slotId" value={slot.id} />
              <Submit className="w-full rounded-full bg-[#D9F24A] py-4 text-base font-bold text-[#111C3A] shadow-[0_10px_24px_-12px_rgba(17,28,58,0.6)] transition active:scale-[0.98] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E47B8]">
                {slot.price > 0 ? `カードで払って申し込む（${yen(slot.price)}）` : "申し込む"}
              </Submit>
            </ActionForm>
          )}
        </div>
      </div>
    </div>
  );
}
