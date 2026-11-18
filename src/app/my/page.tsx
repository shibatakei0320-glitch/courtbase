import Link from "next/link";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/member-auth";
import { yen } from "@/lib/format";
import { Ball, CourtLines, Notice, Spots, hm, jst } from "./ui";

export const metadata = { title: "マイページ" };

export default async function MyPage({ searchParams }: { searchParams: Promise<{ paid?: string; applied?: string }> }) {
  const me = await requireMember();
  const sp = await searchParams;
  const now = new Date();
  const [mine, events] = await Promise.all([
    db.reservation.findMany({
      where: { memberId: me.id, status: "RESERVED", slot: { endsAt: { gte: now } } },
      include: { slot: { include: { court: true } } },
      orderBy: { slot: { startsAt: "asc" } },
    }),
    db.slot.findMany({
      where: { kind: "EVENT", status: "OPEN", startsAt: { gt: now } },
      include: { _count: { select: { reservations: { where: { status: { in: ["RESERVED", "ATTENDED"] } } } } } },
      orderBy: { startsAt: "asc" },
      take: 50,
    }),
  ]);
  const myIds = new Set(mine.map((r) => r.slotId));
  const next = mine[0]?.slot;
  const rest = mine.slice(1);
  const nd = next ? jst(next.startsAt) : null;

  return (
    <div className="space-y-8">
      {/* 次のゲーム：コートを上から見た図に日付を大きく */}
      <section className="relative overflow-hidden rounded-[2rem] bg-[#1E47B8] px-6 pb-7 pt-6 text-white shadow-[0_20px_40px_-24px_rgba(30,71,184,0.8)]">
        <CourtLines />
        <Ball size={64} className="pl-bounce absolute right-5 top-5" />
        <div className="relative">
          {next && nd ? (
            <>
              <p className="text-sm text-white/75">{me.firstName}さんの次のゲーム</p>
              <p className="mt-2 font-display text-[3.5rem] leading-none tracking-tight">
                {nd.m}/{nd.d}
                <span className="ml-2 align-middle text-2xl text-[#D9F24A]">{nd.w}</span>
              </p>
              <p className="mt-3 text-lg font-bold leading-snug">{next.title}</p>
              <p className="mt-1 text-sm text-white/80">{hm(next.startsAt)}〜{hm(next.endsAt)}　{next.court.name}</p>
            </>
          ) : (
            <>
              <p className="text-sm text-white/75">{me.firstName}さん、ようこそ</p>
              <p className="mt-3 font-display text-[2.1rem] leading-[1.25]">次のゲームを<br />決めよう</p>
              <p className="mt-3 max-w-[18rem] text-sm leading-relaxed text-white/80">募集中の大会・イベントから、気になるものを選んで申し込めます。</p>
            </>
          )}
        </div>
      </section>

      {sp.paid && <Notice>お支払いが完了しました。申込みが反映されるまで数秒かかることがあります。表示されないときはページを再読み込みしてください。</Notice>}
      {sp.applied && <Notice>申込みが完了しました。当日コートでお待ちしています。</Notice>}

      {rest.length > 0 && (
        <section>
          <h2 className="mb-3 px-1 font-display text-lg">そのあとの予定</h2>
          <ul className="space-y-2">
            {rest.map((r) => {
              const d = jst(r.slot.startsAt);
              return (
                <li key={r.id} className="flex items-center gap-4 rounded-2xl bg-white px-4 py-3">
                  <span className="w-14 shrink-0"><span className="block font-display text-xl leading-none text-[#1E47B8]">{d.m}/{d.d}</span><span className="block pt-1 text-xs text-[#111C3A]/60">{d.w}曜</span></span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{r.slot.title}</span>
                    <span className="text-sm text-[#111C3A]/60">{hm(r.slot.startsAt)}〜{hm(r.slot.endsAt)}　{r.slot.court.name}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 px-1 font-display text-lg">募集中の大会・イベント</h2>
        {events.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-[#1E47B8]/25 px-6 py-10 text-center text-sm leading-relaxed text-[#111C3A]/70">
            いま募集中の大会・イベントはありません。<br />新しい募集が出たら、ここに並びます。
          </div>
        ) : (
          <ul className="overflow-hidden rounded-3xl bg-white">
            {events.map((s) => {
              const d = jst(s.startsAt);
              const taken = s._count.reservations;
              const left = s.capacity - taken;
              const joined = myIds.has(s.id);
              return (
                <li key={s.id} className="border-t border-[#EEF2F8] first:border-t-0">
                  <Link href={`/my/events/${s.id}`} className="flex gap-4 px-4 py-4 transition-colors hover:bg-[#F7F9FD] focus-visible:bg-[#F7F9FD] focus-visible:outline-none">
                    <span className={`flex w-16 shrink-0 flex-col items-center justify-center rounded-2xl py-2 ${joined ? "bg-[#D9F24A]" : "bg-[#EEF2F8]"}`}>
                      <span className="text-xs text-[#111C3A]/60">{d.m}月</span>
                      <span className="font-display text-3xl leading-none text-[#1E47B8]">{d.d}</span>
                      <span className={`text-xs font-bold ${d.sun ? "text-rose-600" : d.sat ? "text-[#1E47B8]" : "text-[#111C3A]/70"}`}>{d.w}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold leading-snug">{s.title}</span>
                      <span className="mt-0.5 block text-sm text-[#111C3A]/60">{hm(s.startsAt)}〜{hm(s.endsAt)}　{s.price > 0 ? yen(s.price) : "参加無料"}</span>
                      <span className="mt-2 flex items-center gap-2">
                        <Spots taken={taken} capacity={s.capacity} />
                      </span>
                      <span className="mt-1.5 block text-xs font-bold">
                        {joined ? <span className="text-[#1E47B8]">申込み済み</span> : left > 0 ? <span className={left <= 3 ? "text-rose-600" : "text-[#111C3A]/70"}>残り{left}名</span> : <span className="text-[#111C3A]/40">満員</span>}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="px-1 text-xs leading-relaxed text-[#111C3A]/50">申込み後のキャンセル・返金は、施設スタッフにお問い合わせください。</p>
    </div>
  );
}
