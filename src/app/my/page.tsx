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
  const [mine, events] = await Promise.all([
    db.reservation.findMany({
      where: { memberId: me.id, status: "RESERVED", slot: { endsAt: { gte: now } } },
      include: { slot: { include: { court: true } } },
      orderBy: { slot: { startsAt: "asc" } },
    }),
    db.slot.findMany({
      where: { status: "OPEN", memberBooked: false, startsAt: { gt: now }, ...(kind ? { kind } : {}) },
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
      <section className="relative overflow-hidden rounded-2xl bg-[#E6EFE7] px-6 pb-7 pt-6 text-[#13201A]">
        <Court className="-right-12 -top-20 h-[22rem] rotate-[-8deg]" stroke="#0F3D2E" opacity={0.12} />
        <div className="relative">
          <p className="text-sm text-[#13201A]/70">こんにちは、{me.firstName}さん</p>
          {next && nd ? (
            <>
              <p className="mt-4 text-xs font-bold text-[#0F3D2E]">次の予定</p>
              <div className="mt-2 flex items-end gap-4">
                <p className="font-display text-[3.75rem] font-medium leading-[0.85] tracking-tight text-[#0F3D2E]">
                  {nd.m}.{String(nd.d).padStart(2, "0")}
                </p>
                <p className="pb-1 text-sm text-[#13201A]/70">{nd.w}曜日<br />{hm(next.startsAt)}–{hm(next.endsAt)}</p>
              </div>
              <p className="mt-4 text-lg font-bold leading-snug">{next.title}</p>
              <p className="mt-0.5 text-sm text-[#13201A]/60">{next.court.name}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href={`/my/events/${next.id}`} className="rounded-full bg-[#0F3D2E] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0B2F23]">予約の内容を見る</Link>
                <a href="#list" className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#0F3D2E] hover:bg-white/80">ほかのイベントも見る</a>
              </div>
            </>
          ) : (
            <>
              <h1 className="mt-3 text-[1.6rem] font-bold leading-[1.4]">
                参加したいイベントを<br />選んで申し込むだけ。
              </h1>
              <p className="mt-3 max-w-[22rem] text-sm leading-relaxed text-[#13201A]/70">
                {facility ? "コートの予約、レッスン、大会・イベントの申込みが、このページでできます。" : "大会・イベントの申込みは、スマホでこのページから。参加費はカードで払えて、予定はLINEでお知らせします。"}
              </p>
              <ol className="mt-5 grid grid-cols-3 gap-2 text-center">
                {[
                  ["選ぶ", "一覧から見つける"],
                  ["申し込む", "カードで支払い"],
                  ["当日はコートへ", "前日にLINEで連絡"],
                ].map(([t, d], i) => (
                  <li key={t} className="rounded-xl bg-white/80 px-2 py-3">
                    <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-[#0F3D2E] font-display text-sm text-white">{i + 1}</span>
                    <span className="mt-1.5 block text-[13px] font-bold leading-tight">{t}</span>
                    <span className="mt-0.5 block text-[11px] leading-tight text-[#13201A]/55">{d}</span>
                  </li>
                ))}
              </ol>
              <a href="#list" className="mt-5 flex w-full items-center justify-center rounded-full bg-[#0F3D2E] py-3.5 text-sm font-bold text-white hover:bg-[#0B2F23]">申し込めるイベントを見る</a>
            </>
          )}
        </div>
      </section>

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
        <div id="list" className="mb-3 flex scroll-mt-4 items-baseline justify-between px-1">
          <h2 className="text-sm font-bold">申し込めるイベント・枠</h2>
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
            いま申し込めるイベントはありません。新しく公開されると、ここに表示され、LINEでもお知らせします。
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
