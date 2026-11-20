import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/member-auth";
import { ActionForm, Submit } from "@/components/ActionForm";
import { yen } from "@/lib/format";
import { applyEvent, cancelMyReservation } from "../../actions";
import { cancelDeadline } from "@/lib/booking";
import { fmtDateTime } from "@/lib/format";
import { Court, Fill, hm, jst } from "../../ui";
import { Tournament } from "./Tournament";

export const metadata = { title: "予約" };
const KIND_LABEL = { RENTAL: "コート利用", LESSON: "レッスン", EVENT: "大会・イベント" } as const;

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paid?: string; entered?: string }> }) {
  const me = await requireMember();
  const { id } = await params;
  const slot = await db.slot.findUnique({ where: { id }, include: { court: true, program: true, categories: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } } });
  if (!slot) notFound();
  if (slot.categories.length > 0) return <Tournament slot={slot} cats={slot.categories} me={me} flash={await searchParams} />;
  const [taken, mine] = await Promise.all([
    db.reservation.count({ where: { slotId: id, status: { in: ["RESERVED", "ATTENDED"] } } }),
    db.reservation.findFirst({ where: { slotId: id, memberId: me.id, status: { in: ["RESERVED", "ATTENDED"] } } }),
  ]);
  if (slot.memberBooked && !mine) notFound();
  const left = Math.max(0, slot.capacity - taken);
  const deadline = await cancelDeadline(slot.startsAt);
  const paid = mine ? await db.payment.findFirst({ where: { reservationId: mine.id, refundedAt: null, amount: { gt: 0 } } }) : null;
  const isClass = !!slot.classId;
  const canCancel = mine?.status === "RESERVED" && mine.kind !== "REGULAR" && Date.now() <= deadline.at.getTime();
  const closed = slot.status !== "OPEN" || slot.startsAt <= new Date();
  const d = jst(slot.startsAt);
  const about = [slot.program?.description, slot.note].filter(Boolean).join("\n\n");

  return (
    <div className="space-y-8">
      <Link href="/my" className="inline-block px-1 text-xs text-[#1A2420]/55 hover:text-[#1A2420]">← 一覧へ</Link>

      <section className="relative overflow-hidden rounded-2xl bg-[#0B6B4F] px-6 pb-8 pt-7 text-white">
        <Court className="-right-10 -top-16 h-[22rem] rotate-[-8deg]" />
        <div className="relative">
          <p className="font-display text-[4.5rem] font-medium leading-[0.85] tracking-tight">{d.m}.{String(d.d).padStart(2, "0")}</p>
          <p className="mt-3 text-sm text-white/70">{d.w}曜日　{hm(slot.startsAt)}–{hm(slot.endsAt)}</p>
          <p className="mt-6 text-xs text-white/55">{isClass ? (mine?.kind === "MAKEUP" ? "クラス（振替）" : "クラス") : KIND_LABEL[slot.kind]}</p>
          <h1 className="mt-1 max-w-[17rem] text-2xl font-medium leading-snug">{slot.title}</h1>
        </div>
      </section>

      <dl className="divide-y divide-[#1A2420]/10 border-y border-[#1A2420]/10 px-1 text-sm">
        <div className="flex justify-between gap-4 py-4"><dt className="text-[#1A2420]/55">場所</dt><dd className="font-medium">{slot.court.name}</dd></div>
        {!isClass && <div className="flex items-baseline justify-between gap-4 py-4"><dt className="text-[#1A2420]/55">料金</dt><dd className="font-display text-2xl font-medium leading-none">{slot.price > 0 ? yen(slot.price) : "無料"}</dd></div>}
        {!slot.memberBooked && (
        <div className="py-4">
          <div className="flex justify-between gap-4">
            <dt className="text-[#1A2420]/55">定員</dt>
            <dd className="font-medium">{slot.capacity}名　<span className={left > 0 && left <= 3 ? "font-bold text-[#C2410C]" : ""}>残り{left}名</span></dd>
          </div>
          <div className="mt-3"><Fill taken={taken} capacity={slot.capacity} /></div>
        </div>
        )}
      </dl>

      {about && !slot.memberBooked && <p className="whitespace-pre-wrap px-1 text-sm leading-[1.9] text-[#1A2420]/80">{about}</p>}

      {mine?.status === "RESERVED" && mine.kind === "REGULAR" && (
        <section className="px-1">
          <h2 className="text-sm font-bold">お休みするとき</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#1A2420]/65">在籍クラスの回です。<Link href="/my/school" className="underline underline-offset-4">スクールのページ</Link>から欠席連絡すると、振替が1回分付きます。</p>
        </section>
      )}

      {mine?.status === "RESERVED" && mine.kind !== "REGULAR" && (
        <section className="px-1">
          <h2 className="text-sm font-bold">{mine.kind === "MAKEUP" ? "振替の取り消し" : "キャンセル"}</h2>
          {canCancel ? (
            <>
              <p className="mt-2 text-sm leading-relaxed text-[#1A2420]/65">
                {fmtDateTime(deadline.at)}までキャンセルできます。{mine.kind === "MAKEUP" ? "取り消すと振替の権利は戻ります。" : ""}{paid ? `お支払いいただいた${yen(paid.amount)}は全額返金されます。` : ""}
              </p>
              <ActionForm action={cancelMyReservation} confirm={mine.kind === "MAKEUP" ? "この振替を取り消しますか？" : "この予約をキャンセルしますか？"} className="mt-3">
                <input type="hidden" name="id" value={mine.id} />
                <Submit className="rounded-xl border border-[#C2410C]/40 px-5 py-3 text-sm font-bold text-[#C2410C] transition hover:bg-[#C2410C]/5 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C]">
                  {mine.kind === "MAKEUP" ? "振替を取り消す" : "予約をキャンセルする"}
                </Submit>
              </ActionForm>
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-[#1A2420]/65">キャンセルの期限（開始の{deadline.hours}時間前）を過ぎました。やむを得ない場合は施設スタッフにお問い合わせください。</p>
          )}
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 bg-[#F4F6F3]/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-xl">
          {mine ? (
            <p className="rounded-xl border border-[#0B6B4F] py-4 text-center text-sm font-bold text-[#0B6B4F]">{mine.kind === "REGULAR" ? "出席予定です" : mine.kind === "MAKEUP" ? "振替で予約済みです" : "予約済みです"}</p>
          ) : isClass ? (
            closed || left <= 0 ? (
              <p className="rounded-xl border border-[#1A2420]/15 py-4 text-center text-sm text-[#1A2420]/50">{closed ? "受付は終了しました" : "満員です"}</p>
            ) : (
              <Link href="/my/school/makeup" className="block rounded-xl bg-[#0B6B4F] py-4 text-center text-sm font-bold text-white hover:bg-[#08553F]">振替で予約する</Link>
            )
          ) : closed ? (
            <p className="rounded-xl border border-[#1A2420]/15 py-4 text-center text-sm text-[#1A2420]/50">受付は終了しました</p>
          ) : left <= 0 ? (
            <p className="rounded-xl border border-[#1A2420]/15 py-4 text-center text-sm text-[#1A2420]/50">満員になりました</p>
          ) : (
            <ActionForm action={applyEvent}>
              <input type="hidden" name="slotId" value={slot.id} />
              <Submit className="flex w-full items-center justify-between rounded-xl bg-[#0B6B4F] px-6 py-4 text-sm font-bold text-white transition hover:bg-[#08553F] active:scale-[0.99] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B6B4F]">
                <span>{slot.price > 0 ? "カードで払って予約する" : "予約する"}</span>
                {slot.price > 0 && <span className="font-display text-lg font-medium text-[#E3F04B]">{yen(slot.price)}</span>}
              </Submit>
            </ActionForm>
          )}
        </div>
      </div>
    </div>
  );
}
