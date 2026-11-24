import Link from "next/link";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/member-auth";
import { categoryLabel, entryName } from "@/lib/entry";
import { fmtDate, jstDateKey, yen } from "@/lib/format";
import { hm, jst } from "../ui";

export const metadata = { title: "エントリー履歴" };

const STATUS = { RESERVED: "予約済み", ATTENDED: "参加済み", NO_SHOW: "欠席", CANCELED: "取り消し" } as const;

export default async function History() {
  const me = await requireMember();
  const [list, payments] = await Promise.all([
    db.reservation.findMany({
      where: { memberId: me.id },
      include: { slot: { include: { court: true } }, category: true },
      orderBy: { slot: { startsAt: "desc" } },
      take: 100,
    }),
    db.payment.findMany({ where: { memberId: me.id }, orderBy: { paidAt: "desc" }, take: 100 }),
  ]);
  const payByRes = new Map(payments.filter((p) => p.reservationId).map((p) => [p.reservationId!, p]));
  const name = `${me.lastName} ${me.firstName}`;
  const other = payments.filter((p) => p.amount > 0 && !p.reservationId);

  return (
    <div className="space-y-8 pt-2">
      <div className="px-1">
        <Link href="/my" className="inline-block text-xs text-[#1A2420]/55 hover:text-[#1A2420]">← マイページへ</Link>
        <h1 className="mt-4 text-2xl font-medium tracking-wide">エントリー履歴</h1>
        <p className="mt-2 text-sm text-[#1A2420]/60">これまでの申込みと、カード払いの領収書を確認できます。</p>
      </div>

      {list.length === 0 ? (
        <p className="border-y border-[#1A2420]/10 px-1 py-10 text-sm text-[#1A2420]/55">まだ申込みはありません。</p>
      ) : (
        <ul className="divide-y divide-[#1A2420]/10 border-y border-[#1A2420]/10">
          {list.map((r) => {
            const d = jst(r.slot.startsAt);
            const p = payByRes.get(r.id);
            return (
              <li key={r.id} className="flex gap-5 px-1 py-4">
                <span className="w-14 shrink-0">
                  <span className="block font-display text-2xl font-medium leading-none text-[#0B6B4F]">{d.m}.{String(d.d).padStart(2, "0")}</span>
                  <span className="mt-1 block text-xs text-[#1A2420]/50">{jstDateKey(r.slot.startsAt).slice(0, 4)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <Link href={`/my/events/${r.slotId}`} className="block font-medium hover:underline hover:underline-offset-4">{r.slot.title}</Link>
                  {r.category && <span className="block text-xs text-[#1A2420]/60">{categoryLabel(r.category)}　{entryName(r, name)}</span>}
                  <span className="block text-xs text-[#1A2420]/50">{d.w}曜日　{hm(r.slot.startsAt)}–{hm(r.slot.endsAt)}　{r.slot.court.name}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                    <span className={r.status === "CANCELED" ? "text-[#1A2420]/40" : "font-bold text-[#0B6B4F]"}>{STATUS[r.status]}</span>
                    {p && <span className="text-[#1A2420]/60">{yen(p.amount)}{p.refundedAt ? "（返金済み）" : ""}</span>}
                    {p && !p.refundedAt && <Link href={`/my/receipt/${p.id}`} className="underline underline-offset-4">領収書</Link>}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {other.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-sm font-bold">そのほかのお支払い</h2>
          <ul className="divide-y divide-[#1A2420]/10 border-y border-[#1A2420]/10 text-sm">
            {other.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-1 py-3">
                <span><span className="block">{p.description ?? "お支払い"}</span><span className="text-xs text-[#1A2420]/50">{fmtDate(p.paidAt)}</span></span>
                <span className="shrink-0 text-right">{yen(p.amount)}{!p.refundedAt && <Link href={`/my/receipt/${p.id}`} className="ml-3 text-xs underline underline-offset-4">領収書</Link>}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
