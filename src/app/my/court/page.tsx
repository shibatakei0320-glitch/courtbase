import { redirect } from "next/navigation";
import Link from "next/link";
import { db, facilityModeOn } from "@/lib/db";
import { requireMember } from "@/lib/member-auth";
import { ActionForm, Submit } from "@/components/ActionForm";
import { addDays, fromJst, jstDateKey, yen } from "@/lib/format";
import { MAX_MIN, STEP_MIN, busyRanges, clearExpiredHolds, courtPrice, hhmm, overlapsAny } from "@/lib/court-booking";
import { bookCourt } from "../actions";
import { jst } from "../ui";

export const metadata = { title: "コートを予約" };
export const dynamic = "force-dynamic";

const DAYS = 14;

export default async function CourtBooking({ searchParams }: { searchParams: Promise<{ date?: string; court?: string; start?: string }> }) {
  await requireMember();
  if (!(await facilityModeOn())) redirect("/my");
  const sp = await searchParams;
  const today = jstDateKey(new Date());
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
  const date = sp.date && dates.includes(sp.date) ? sp.date : today;
  const [courts, setting] = await Promise.all([
    db.court.findMany({ where: { active: true, memberBookable: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.setting.findUnique({ where: { id: 1 } }),
  ]);
  const court = courts.find((c) => c.id === sp.court) ?? courts[0];
  const q = (p: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ date, court: court?.id, ...p })) if (v) u.set(k, v);
    return `/my/court?${u}`;
  };

  if (!court) {
    return (
      <div className="space-y-6 pt-2">
        <Link href="/my" className="inline-block px-1 text-xs text-[#1A2420]/55 hover:text-[#1A2420]">← マイページへ</Link>
        <p className="border-y border-[#1A2420]/10 px-1 py-10 text-sm text-[#1A2420]/60">いま会員ページから予約できるコートはありません。</p>
      </div>
    );
  }

  await clearExpiredHolds(court.id);
  const busy = await busyRanges(court.id, date);
  const openMin = (setting?.openHour ?? 7) * 60;
  const closeMin = (setting?.closeHour ?? 23) * 60;
  const base = fromJst(date).getTime();
  const now = Date.now();
  const times = [];
  for (let m = openMin; m + STEP_MIN <= closeMin; m += STEP_MIN) {
    const a = base + m * 60_000;
    const free = a > now && !overlapsAny(busy, a, a + STEP_MIN * 60_000);
    times.push({ m, label: hhmm(m), free });
  }
  const startMin = sp.start && /^\d{2}:\d{2}$/.test(sp.start) ? Number(sp.start.slice(0, 2)) * 60 + Number(sp.start.slice(3)) : null;
  const startOk = startMin !== null && times.some((t) => t.m === startMin && t.free);
  const durations: number[] = [];
  if (startOk) {
    for (let d = STEP_MIN; d <= MAX_MIN && startMin! + d <= closeMin; d += STEP_MIN) {
      const a = base + startMin! * 60_000;
      if (overlapsAny(busy, a, a + d * 60_000)) break;
      durations.push(d);
    }
  }

  return (
    <div className="space-y-8 pt-2">
      <div className="px-1">
        <Link href="/my" className="inline-block text-xs text-[#1A2420]/55 hover:text-[#1A2420]">← マイページへ</Link>
        <h1 className="mt-4 text-2xl font-medium tracking-wide">コートを予約</h1>
        <p className="mt-2 text-sm text-[#1A2420]/60">日付・コート・開始時刻を選んでください。{court.hourlyPrice > 0 ? `料金は1時間 ${yen(court.hourlyPrice)} です。` : "このコートは無料で使えます。"}</p>
      </div>

      <section>
        <h2 className="mb-2 px-1 text-sm font-bold">日付</h2>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {dates.map((d) => {
            const j = jst(fromJst(d));
            const on = d === date;
            return (
              <Link key={d} href={q({ date: d, start: undefined })} aria-current={on ? "date" : undefined}
                className={`flex w-14 shrink-0 flex-col items-center rounded-xl py-2 ${on ? "bg-[#0B6B4F] text-white" : "bg-white text-[#1A2420]"}`}>
                <span className="font-display text-xl font-medium leading-none">{j.m}.{String(j.d).padStart(2, "0")}</span>
                <span className={`mt-1 text-[11px] ${on ? "text-white/70" : "text-[#1A2420]/50"}`}>{j.w}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {courts.length > 1 && (
        <section>
          <h2 className="mb-2 px-1 text-sm font-bold">コート</h2>
          <div className="flex flex-wrap gap-1.5">
            {courts.map((c) => (
              <Link key={c.id} href={q({ court: c.id, start: undefined })} aria-current={c.id === court.id ? "page" : undefined}
                className={`rounded-full px-4 py-2 text-sm ${c.id === court.id ? "bg-[#0B6B4F] text-white" : "bg-white"}`}>
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 px-1 text-sm font-bold">開始時刻</h2>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          {times.map((t) =>
            t.free ? (
              <Link key={t.m} href={q({ start: t.label })}
                className={`rounded-lg py-2.5 text-center font-display text-lg font-medium leading-none ${t.m === startMin ? "bg-[#0B6B4F] text-[#E3F04B]" : "bg-white text-[#0B6B4F] hover:bg-[#E9EEE6]"}`}>
                {t.label}
              </Link>
            ) : (
              <span key={t.m} className="rounded-lg py-2.5 text-center font-display text-lg leading-none text-[#1A2420]/20 line-through" aria-label={`${t.label} 予約できません`}>{t.label}</span>
            ),
          )}
        </div>
        <p className="mt-2 px-1 text-xs text-[#1A2420]/45">線が引かれた時間は、すでに埋まっているか受付が終わっています。</p>
      </section>

      {startOk && durations.length > 0 && (
        <section className="rounded-2xl bg-white px-5 py-6">
          <h2 className="text-sm font-bold">利用時間</h2>
          <ActionForm action={bookCourt} className="mt-3 space-y-5">
            <input type="hidden" name="courtId" value={court.id} />
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="start" value={sp.start} />
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {durations.map((d, i) => (
                <label key={d} className="flex cursor-pointer items-baseline justify-between rounded-xl border border-[#1A2420]/15 px-4 py-3 has-[:checked]:border-[#0B6B4F] has-[:checked]:bg-[#0B6B4F] has-[:checked]:text-white">
                  <input type="radio" name="minutes" value={d} defaultChecked={i === Math.min(1, durations.length - 1)} className="sr-only" />
                  <span className="text-sm">{d % 60 ? `${d}分` : `${d / 60}時間`}</span>
                  <span className="font-display text-base">{courtPrice(court.hourlyPrice, d) > 0 ? yen(courtPrice(court.hourlyPrice, d)) : "無料"}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-[#1A2420]/55">{court.name}　{date.slice(5).replace("-", "/")} {sp.start}〜</p>
            <Submit className="w-full rounded-xl bg-[#0B6B4F] py-4 text-sm font-bold text-white transition hover:bg-[#08553F] active:scale-[0.99] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B6B4F]">
              {court.hourlyPrice > 0 ? "カードで払って予約する" : "予約する"}
            </Submit>
            {court.hourlyPrice > 0 && <p className="text-xs leading-relaxed text-[#1A2420]/45">決済画面で30分以内にお支払いがない場合、選んだ時間は自動で解放されます。</p>}
          </ActionForm>
        </section>
      )}
    </div>
  );
}
