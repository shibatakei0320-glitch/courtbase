import Link from "next/link";
import { requireMember } from "@/lib/member-auth";
import { ActionForm, Submit } from "@/components/ActionForm";
import { fmtDate } from "@/lib/format";
import { availableCredits, makeupCandidates } from "@/lib/school";
import { bookMyMakeup } from "../../actions";
import { Fill, hm, jst } from "../../ui";

export const metadata = { title: "振替の予約" };

export default async function MakeupPage({ searchParams }: { searchParams: Promise<{ credit?: string }> }) {
  const me = await requireMember();
  const sp = await searchParams;
  const credits = await availableCredits(me.id);
  const credit = credits.find((c) => c.id === sp.credit) ?? credits[0];
  const slots = credit ? await makeupCandidates(me.id, credit) : [];

  return (
    <div className="space-y-8">
      <Link href="/my/school" className="inline-block px-1 text-xs text-[#13201A]/55 hover:text-[#13201A]">← スクール</Link>
      <h1 className="px-1 text-xl font-bold">振替の回を選ぶ</h1>

      {!credit ? (
        <p className="border-y border-[#13201A]/10 px-1 py-8 text-sm leading-relaxed text-[#13201A]/55">使える振替がありません。レッスンを欠席連絡すると、振替が1回分付きます。</p>
      ) : (
        <>
          {credits.length > 1 && (
            <nav className="flex gap-1 overflow-x-auto px-1 pb-1" aria-label="使う振替">
              {credits.map((c) => (
                <Link key={c.id} href={`/my/school/makeup?credit=${c.id}`} aria-current={c.id === credit.id ? "true" : undefined}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs ${c.id === credit.id ? "bg-[#0F3D2E] text-white" : "bg-white text-[#13201A]/60 hover:text-[#13201A]"}`}>
                  {fmtDate(c.expiresAt).slice(5)}まで
                </Link>
              ))}
            </nav>
          )}
          <p className="px-1 text-sm leading-relaxed text-[#13201A]/65">
            {fmtDate(credit.expiresAt)}までの、空きのある回から選べます。
          </p>
          {slots.length === 0 ? (
            <p className="border-y border-[#13201A]/10 px-1 py-8 text-sm leading-relaxed text-[#13201A]/55">いま振替できる回はありません。欠席や新しい回の公開で空きが出ると、ここに表示されます。</p>
          ) : (
            <ul className="divide-y divide-[#13201A]/10 border-y border-[#13201A]/10">
              {slots.map((s) => {
                const d = jst(s.startsAt);
                return (
                  <li key={s.id} className="flex gap-5 px-1 py-5">
                    <span className="w-14 shrink-0">
                      <span className="block font-display text-[1.9rem] font-medium leading-none text-[#0F3D2E]">{d.m}.{String(d.d).padStart(2, "0")}</span>
                      <span className="mt-1 block text-xs text-[#13201A]/55">{d.w}曜日</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium leading-snug">{s.title}</span>
                      <span className="mt-1 block text-xs text-[#13201A]/55">
                        {hm(s.startsAt)}–{hm(s.endsAt)}　{s.court.name}{s.schoolClass?.level && `　${s.schoolClass.level.name}`}{s.instructor && `　${s.instructor.name}`}
                      </span>
                      <span className="mt-3 flex items-center gap-3">
                        <span className="flex-1"><Fill taken={s.capacity - s.left} capacity={s.capacity} /></span>
                        <span className={`shrink-0 text-xs ${s.left <= 2 ? "font-bold text-[#B4371F]" : "text-[#13201A]/60"}`}>残り{s.left}名</span>
                      </span>
                      <ActionForm action={bookMyMakeup} confirm={`${d.m}/${d.d}(${d.w}) ${hm(s.startsAt)} の「${s.title}」に振替しますか？`} className="mt-3">
                        <input type="hidden" name="creditId" value={credit.id} />
                        <input type="hidden" name="slotId" value={s.id} />
                        <Submit className="rounded-lg bg-[#0F3D2E] px-4 py-2 text-xs font-bold text-white hover:bg-[#0B2F23] disabled:opacity-60">この回に振替する</Submit>
                      </ActionForm>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
