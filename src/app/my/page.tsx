import Link from "next/link";
import { db, facilityModeOn } from "@/lib/db";
import { requireMember } from "@/lib/member-auth";
import type { SlotKind } from "@prisma/client";
import { yen } from "@/lib/format";
import { Court, Fill, Notice, hm, jst } from "./ui";

export const metadata = { title: "マイページ" };

const KINDS: { key: SlotKind | "ALL"; label: string }[] = [
  { key: "ALL", label: "すべて" },
  { key: "RENTAL", label: "コート利用" },
  { key: "LESSON", label: "レッスン" },
  { key: "EVENT", label: "大会・イベント" },
];
const KIND_LABEL: Record<SlotKind, string> = { RENTAL: "コート利用", LESSON: "レッスン", EVENT: "大会・イベント" };

export default async function MyPage({ searchParams }: { searchParams: Promise<{ paid?: string; applied?: string; kind?: string; canceled?: string }> }) {
  const me = await requireMember();
  const sp = await searchParams;
  const kind = KINDS.some((k) => k.key === sp.kind && k.key !== "ALL") ? (sp.kind as SlotKind) : null;
  const now = new Date();
  const facility = await facilityModeOn();
  const [enrolled, credits] = await Promise.all([
    db.enrollment.count({ where: { memberId: me.id, OR: [{ endDate: null }, { endDate: { gte: new Date(now.getTime() - 86400_000) } }] } }),
    db.makeupCredit.count({ where: { memberId: me.id, status: "AVAILABLE", expiresAt: { gt: now } } }),
  ]);
  const [mine, events] = await Promise.all([
    db.reservation.findMany({
      where: { memberId: me.id, status: "RESERVED", slot: { endsAt: { gte: now } } },
      include: { slot: { include: { court: true } } },
      orderBy: { slot: { startsAt: "asc" } },
    }),
    db.slot.findMany({
      where: { status: "OPEN", memberBooked: false, classId: null, startsAt: { gt: now }, ...(kind ? { kind } : {}) },
      include: { _count: { select: { categories: true, reservations: { where: { status: { in: ["RESERVED", "ATTENDED"] } } } } } },
      orderBy: { startsAt: "asc" },
      take: 60,
    }),
  ]);
  const myIds = new Set(mine.map((r) => r.slotId));
  const next = mine[0]?.slot;
  const rest = mine.slice(1);
  const nd = next ? jst(next.startsAt) : null;

  return (
    <div className="space-y-10">
      <div className="space-y-3">
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
              <Link href={`/my/events/${next.id}`} className="mt-5 inline-block border-b border-white/40 pb-0.5 text-xs text-white/80 hover:border-white hover:text-white">予約の詳細・キャンセル</Link>
            </>
          ) : (
            <>
              <p className="text-xs text-white/60">{me.firstName}さん</p>
              <p className="mt-4 text-[1.9rem] font-medium leading-[1.35] tracking-wide">コートに立つ日を、<br />選ぶ。</p>
              <p className="mt-4 max-w-[19rem] text-sm leading-relaxed text-white/65">{facility ? "コートの利用、レッスン、大会・イベントをここから予約できます。" : "大会・イベントの申込みは、ここからできます。"}</p>
            </>
          )}
        </div>
      </section>

      {(enrolled > 0 || credits > 0) && (
        <Link href="/my/school" className="flex items-center justify-between rounded-2xl bg-white px-5 py-4 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#0F3D2E]">
          <span>
            <span className="block text-sm font-bold">スクール</span>
            <span className="mt-1 block text-xs text-[#13201A]/50">欠席連絡・振替の予約</span>
          </span>
          {credits > 0 ? (
            <span className="text-right">
              <span className="block text-[11px] text-[#13201A]/50">使える振替</span>
              <span className="font-display text-2xl font-medium leading-none text-[#0F3D2E]">{credits}<span className="ml-0.5 text-xs">回</span></span>
            </span>
          ) : <span className="text-xs text-[#13201A]/50">開く →</span>}
        </Link>
      )}
      <div className={`grid gap-3 ${facility ? "grid-cols-3" : "grid-cols-1"}`}>
        {facility && (
          <>
            <Link href="/my/court" className="rounded-2xl bg-white px-4 py-4 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#0F3D2E]">
              <span className="block text-sm font-bold">コートを予約</span>
              <span className="mt-1 block text-xs text-[#13201A]/50">時間を選んで予約</span>
            </Link>
            <Link href="/my/card" className="rounded-2xl bg-white px-4 py-4 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#0F3D2E]">
              <span className="block text-sm font-bold">会員証</span>
              <span className="mt-1 block text-xs text-[#13201A]/50">入退場用QRコード</span>
            </Link>
          </>
        )}
        <Link href="/my/history" className={`rounded-2xl bg-white px-4 py-4 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#0F3D2E] ${facility ? "" : "flex items-center justify-between"}`}>
          <span className="block text-sm font-bold">{facility ? "履歴・領収書" : "エントリー履歴・領収書"}</span>
          <span className="mt-1 block text-xs text-[#13201A]/50">{facility ? "申込みの記録" : "これまでの申込みと領収書"}</span>
        </Link>
      </div>
      </div>

      {sp.paid && <Notice>お支払いが完了しました。予約の反映まで数秒かかることがあります。表示されないときはページを再読み込みしてください。</Notice>}
      {sp.applied && <Notice>予約が完了しました。</Notice>}
      {sp.canceled !== undefined && <Notice>予約をキャンセルしました。{Number(sp.canceled) > 0 ? `${yen(Number(sp.canceled))}を返金しました。カード会社によって、明細への反映まで数日〜2週間ほどかかります。` : ""}</Notice>}

      {rest.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-sm font-bold">そのあとの予定</h2>
          <ul className="divide-y divide-[#13201A]/10 border-y border-[#13201A]/10">
            {rest.map((r) => {
              const d = jst(r.slot.startsAt);
              return (
                <li key={r.id}>
                  <Link href={`/my/events/${r.slotId}`} className="flex items-baseline gap-5 px-1 py-4 hover:underline hover:underline-offset-4">
                    <span className="w-14 shrink-0 font-display text-2xl font-medium leading-none text-[#0F3D2E]">{d.m}.{String(d.d).padStart(2, "0")}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.slot.title}</span>
                      <span className="text-xs text-[#13201A]/55">{d.w}曜日　{hm(r.slot.startsAt)}–{hm(r.slot.endsAt)}　{r.slot.court.name}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between px-1">
          <h2 className="text-sm font-bold">予約できる枠</h2>
          {events.length > 0 && <span className="font-display text-sm text-[#13201A]/50">{events.length}件</span>}
        </div>
        <nav className="mb-2 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="種類で絞り込む">
          {KINDS.filter((k) => facility || k.key !== "RENTAL").map((k) => {
            const active = (kind ?? "ALL") === k.key;
            return (
              <Link
                key={k.key}
                href={k.key === "ALL" ? "/my" : `/my?kind=${k.key}`}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs ${active ? "bg-[#0F3D2E] text-white" : "text-[#13201A]/60 hover:text-[#13201A]"}`}
              >
                {k.label}
              </Link>
            );
          })}
        </nav>
        {events.length === 0 ? (
          <p className="border-y border-[#13201A]/10 px-1 py-10 text-sm leading-relaxed text-[#13201A]/55">
            いま予約できる枠はありません。新しい枠が公開されると、ここに表示されます。
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
                      <span className="block text-[11px] text-[#13201A]/45">{KIND_LABEL[s.kind]}</span>
                      <span className="block font-medium leading-snug group-hover:underline group-hover:underline-offset-4">{s.title}</span>
                      <span className="mt-1 block text-xs text-[#13201A]/55">{hm(s.startsAt)}–{hm(s.endsAt)}　{s._count.categories ? "参加費は種目ごと" : s.price > 0 ? yen(s.price) : "参加無料"}</span>
                      <span className="mt-3 flex items-center gap-3">
                        <span className="flex-1"><Fill taken={taken} capacity={s.capacity} /></span>
                        <span className={`shrink-0 text-xs ${joined ? "font-bold text-[#0F3D2E]" : left <= 0 ? "text-[#13201A]/40" : left <= 3 ? "font-bold text-[#B4371F]" : "text-[#13201A]/60"}`}>
                          {joined ? (s._count.categories ? "エントリー済み" : "予約済み") : left <= 0 ? "満員" : s._count.categories ? `${s._count.categories}種目 受付中` : `残り${left}名`}
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

      <p className="px-1 text-xs leading-relaxed text-[#13201A]/45">予約後のキャンセル・返金は、施設スタッフにお問い合わせください。</p>
    </div>
  );
}
