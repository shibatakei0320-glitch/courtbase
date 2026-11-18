import Link from "next/link";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/member-auth";
import { yen } from "@/lib/format";
import { Court, Fill, Notice, hm, jst } from "./ui";

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
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-2xl bg-[#0F3D2E] px-6 pb-8 pt-7 text-white">
        <Court className="-right-10 -top-16 h-[22rem] rotate-[-8deg]" />
        <div className="relative">
          {next && nd ? (
            <>
              <p className="text-xs text-white/60">次の予定</p>
              <p className="mt-3 font-display text-[4.5rem] font-medium leading-[0.85] tracking-tight">
                {nd.m}.{String(nd.d).padStart(2, "0")}
              </p>
              <p className="mt-3 text-sm text-white/70">{nd.w}曜日　{hm(next.startsAt)}–{hm(next.endsAt)}</p>
              <p className="mt-5 max-w-[16rem] text-lg font-medium leading-snug">{next.title}</p>
              <p className="mt-1 text-sm text-white/60">{next.court.name}</p>
            </>
          ) : (
            <>
              <p className="text-xs text-white/60">{me.firstName}さん</p>
              <p className="mt-4 text-[1.9rem] font-medium leading-[1.35] tracking-wide">次の一戦を、<br />選ぶ。</p>
              <p className="mt-4 max-w-[19rem] text-sm leading-relaxed text-white/65">募集中の大会・イベントから申し込めます。</p>
            </>
          )}
        </div>
      </section>

      {sp.paid && <Notice>お支払いが完了しました。申込みの反映まで数秒かかることがあります。表示されないときはページを再読み込みしてください。</Notice>}
      {sp.applied && <Notice>申込みが完了しました。</Notice>}

      {rest.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-sm font-bold">そのあとの予定</h2>
          <ul className="divide-y divide-[#13201A]/10 border-y border-[#13201A]/10">
            {rest.map((r) => {
              const d = jst(r.slot.startsAt);
              return (
                <li key={r.id} className="flex items-baseline gap-5 px-1 py-4">
                  <span className="w-14 shrink-0 font-display text-2xl font-medium leading-none text-[#0F3D2E]">{d.m}.{String(d.d).padStart(2, "0")}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.slot.title}</span>
                    <span className="text-xs text-[#13201A]/55">{d.w}曜日　{hm(r.slot.startsAt)}–{hm(r.slot.endsAt)}　{r.slot.court.name}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 className="text-sm font-bold">大会・イベント</h2>
          {events.length > 0 && <span className="font-display text-sm text-[#13201A]/50">{events.length}件募集中</span>}
        </div>
        {events.length === 0 ? (
          <p className="border-y border-[#13201A]/10 px-1 py-10 text-sm leading-relaxed text-[#13201A]/55">
            いま募集中の大会・イベントはありません。新しい募集はここに表示されます。
          </p>
        ) : (
          <ul className="divide-y divide-[#13201A]/10 border-y border-[#13201A]/10">
            {events.map((s) => {
              const d = jst(s.startsAt);
              const taken = s._count.reservations;
              const left = s.capacity - taken;
              const joined = myIds.has(s.id);
              return (
                <li key={s.id}>
                  <Link href={`/my/events/${s.id}`} className="group flex gap-5 px-1 py-5 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#0F3D2E]">
                    <span className="w-14 shrink-0">
                      <span className="block font-display text-[2rem] font-medium leading-none text-[#0F3D2E]">{d.m}.{String(d.d).padStart(2, "0")}</span>
                      <span className="mt-1 block text-xs text-[#13201A]/55">{d.w}曜日</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium leading-snug group-hover:underline group-hover:underline-offset-4">{s.title}</span>
                      <span className="mt-1 block text-xs text-[#13201A]/55">{hm(s.startsAt)}–{hm(s.endsAt)}　{s.price > 0 ? yen(s.price) : "参加無料"}</span>
                      <span className="mt-3 flex items-center gap-3">
                        <span className="flex-1"><Fill taken={taken} capacity={s.capacity} /></span>
                        <span className={`shrink-0 text-xs ${joined ? "font-bold text-[#0F3D2E]" : left <= 0 ? "text-[#13201A]/40" : left <= 3 ? "font-bold text-[#B4371F]" : "text-[#13201A]/60"}`}>
                          {joined ? "申込み済み" : left <= 0 ? "満員" : `残り${left}名`}
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="px-1 text-xs leading-relaxed text-[#13201A]/45">申込み後のキャンセル・返金は、施設スタッフにお問い合わせください。</p>
    </div>
  );
}
