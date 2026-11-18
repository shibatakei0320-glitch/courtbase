import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/member-auth";
import { ActionForm, Submit } from "@/components/ActionForm";
import { fmtTime, fmtWeekday, yen } from "@/lib/format";
import { applyEvent } from "../../actions";

export const metadata = { title: "大会・イベント" };

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMember();
  const { id } = await params;
  const slot = await db.slot.findUnique({ where: { id }, include: { court: true, program: true } });
  if (!slot || slot.kind !== "EVENT") notFound();
  const [count, mine] = await Promise.all([
    db.reservation.count({ where: { slotId: id, status: { in: ["RESERVED", "ATTENDED"] } } }),
    db.reservation.findFirst({ where: { slotId: id, memberId: me.id, status: { in: ["RESERVED", "ATTENDED"] } } }),
  ]);
  const left = slot.capacity - count;
  const closed = slot.status !== "OPEN" || slot.startsAt <= new Date();
  return (
    <>
      <Link href="/my" className="text-sm text-slate-500 hover:text-slate-700">← 戻る</Link>
      <div className="card mt-2 p-6">
        <h1 className="mb-3 text-lg font-bold">{slot.title}</h1>
        <dl className="mb-4 grid grid-cols-[5rem_1fr] gap-y-1 text-sm">
          <dt className="text-slate-500">日時</dt><dd>{fmtWeekday(slot.startsAt)} {fmtTime(slot.startsAt)}〜{fmtTime(slot.endsAt)}</dd>
          <dt className="text-slate-500">場所</dt><dd>{slot.court.name}</dd>
          <dt className="text-slate-500">参加費</dt><dd>{slot.price > 0 ? yen(slot.price) : "無料"}</dd>
          <dt className="text-slate-500">定員</dt><dd>{slot.capacity}名（残り{Math.max(0, left)}名）</dd>
        </dl>
        {(slot.program?.description || slot.note) && <p className="mb-4 whitespace-pre-wrap text-sm text-slate-700">{slot.program?.description ?? slot.note}</p>}
        {mine ? (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">お申込み済みです。</p>
        ) : closed ? (
          <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">受付は終了しました。</p>
        ) : left <= 0 ? (
          <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">定員に達しました。</p>
        ) : (
          <ActionForm action={applyEvent}>
            <input type="hidden" name="slotId" value={slot.id} />
            <Submit className="btn-primary w-full">{slot.price > 0 ? `カードで支払って申し込む（${yen(slot.price)}）` : "申し込む"}</Submit>
          </ActionForm>
        )}
      </div>
    </>
  );
}
