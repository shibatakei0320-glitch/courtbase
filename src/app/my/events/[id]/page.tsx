import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/member-auth";
import { ActionForm, Submit } from "@/components/ActionForm";
import { yen } from "@/lib/format";
import { applyEvent } from "../../actions";
import { Court, Fill, hm, jst } from "../../ui";

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
    <div className="space-y-8">
      <Link href="/my" className="inline-block px-1 text-xs text-[#13201A]/55 hover:text-[#13201A]">← 一覧へ</Link>

      <section className="relative overflow-hidden rounded-2xl bg-[#0F3D2E] px-6 pb-8 pt-7 text-white">
        <Court className="-right-10 -top-16 h-[22rem] rotate-[-8deg]" />
        <div className="relative">
          <p className="font-display text-[4.5rem] font-medium leading-[0.85] tracking-tight">{d.m}.{String(d.d).padStart(2, "0")}</p>
          <p className="mt-3 text-sm text-white/70">{d.w}曜日　{hm(slot.startsAt)}–{hm(slot.endsAt)}</p>
          <h1 className="mt-6 max-w-[17rem] text-2xl font-medium leading-snug">{slot.title}</h1>
        </div>
      </section>

      <dl className="divide-y divide-[#13201A]/10 border-y border-[#13201A]/10 px-1 text-sm">
        <div className="flex justify-between gap-4 py-4"><dt className="text-[#13201A]/55">場所</dt><dd className="font-medium">{slot.court.name}</dd></div>
        <div className="flex items-baseline justify-between gap-4 py-4"><dt className="text-[#13201A]/55">参加費</dt><dd className="font-display text-2xl font-medium leading-none">{slot.price > 0 ? yen(slot.price) : "無料"}</dd></div>
        <div className="py-4">
          <div className="flex justify-between gap-4">
            <dt className="text-[#13201A]/55">定員</dt>
            <dd className="font-medium">{slot.capacity}名　<span className={left > 0 && left <= 3 ? "font-bold text-[#B4371F]" : ""}>残り{left}名</span></dd>
          </div>
          <div className="mt-3"><Fill taken={taken} capacity={slot.capacity} /></div>
        </div>
      </dl>

      {about && <p className="whitespace-pre-wrap px-1 text-sm leading-[1.9] text-[#13201A]/80">{about}</p>}

      <div className="fixed inset-x-0 bottom-0 z-10 bg-[#F2F3F0]/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-xl">
          {mine ? (
            <p className="rounded-xl border border-[#0F3D2E] py-4 text-center text-sm font-bold text-[#0F3D2E]">申込み済みです</p>
          ) : closed ? (
            <p className="rounded-xl border border-[#13201A]/15 py-4 text-center text-sm text-[#13201A]/50">受付は終了しました</p>
          ) : left <= 0 ? (
            <p className="rounded-xl border border-[#13201A]/15 py-4 text-center text-sm text-[#13201A]/50">満員になりました</p>
          ) : (
            <ActionForm action={applyEvent}>
              <input type="hidden" name="slotId" value={slot.id} />
              <Submit className="flex w-full items-center justify-between rounded-xl bg-[#0F3D2E] px-6 py-4 text-sm font-bold text-white transition hover:bg-[#0B2F23] active:scale-[0.99] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F3D2E]">
                <span>{slot.price > 0 ? "カードで払って申し込む" : "申し込む"}</span>
                {slot.price > 0 && <span className="font-display text-lg font-medium text-[#E4F25C]">{yen(slot.price)}</span>}
              </Submit>
            </ActionForm>
          )}
        </div>
      </div>
    </div>
  );
}
