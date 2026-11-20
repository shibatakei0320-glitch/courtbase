import Link from "next/link";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/member-auth";
import { ActionForm, Submit } from "@/components/ActionForm";
import { fmtDate } from "@/lib/format";
import { familyMember, familyOf } from "@/lib/family";
import { availableCredits, gradeLabel, makeupCandidates } from "@/lib/school";
import { bookMyMakeup } from "../../actions";
import { Chip, FamilyTabs, Fill, hm, mdw, ui } from "../../ui";

export const metadata = { title: "振替予約" };

export default async function MakeupPage({ searchParams }: { searchParams: Promise<{ m?: string; credit?: string }> }) {
  const me = await requireMember();
  const sp = await searchParams;
  const fam = await familyOf(me);
  // 指定がなければ、振替を持っている最初の人
  const withCredit = (await db.makeupCredit.findFirst({ where: { memberId: { in: fam.map((f) => f.id) }, status: "AVAILABLE", expiresAt: { gt: new Date() } }, orderBy: { expiresAt: "asc" } }))?.memberId;
  const who = (await familyMember(me, sp.m ?? withCredit)) ?? me;
  const credits = await availableCredits(who.id);
  const credit = credits.find((c) => c.id === sp.credit) ?? credits[0];
  const slots = credit ? await makeupCandidates(who.id, credit) : [];
  const tabs = fam.map((f) => ({ id: f.id, firstName: f.firstName, grade: gradeLabel(f.birthDate) }));
  const name = fam.length > 1 ? `${who.firstName}さんの` : "";

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href={`/my/school?m=${who.id}`} className={`px-1 text-sm ${ui.link}`}>← レッスン予定</Link>
        <h1 className="px-1 text-2xl font-bold">{name}振替予約</h1>
        <FamilyTabs fam={tabs} current={who.id} base="/my/school/makeup" />
      </div>

      {!credit ? (
        <p className={`${ui.card} text-base leading-relaxed text-[#5B6661]`}>使える振替がありません。レッスンを「お休みする」と、振替が1回分付きます。</p>
      ) : (
        <>
          <div className={ui.card}>
            <p className="text-base">使える振替 <b className="text-xl">{credits.length}回</b></p>
            <p className="mt-1 text-sm text-[#5B6661]">{fmtDate(credit.expiresAt)}までの、空きのある回から選べます。</p>
            {credits.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {credits.map((c) => (
                  <Link key={c.id} href={`/my/school/makeup?m=${who.id}&credit=${c.id}`} className={`rounded-full border-2 px-3 py-1 text-sm ${c.id === credit.id ? "border-[#0B6B4F] bg-[#0B6B4F] text-white" : "border-[#1A2420]/15"}`}>
                    {fmtDate(c.expiresAt).slice(5)}まで
                  </Link>
                ))}
              </div>
            )}
          </div>
          {slots.length === 0 ? (
            <p className={`${ui.card} text-base leading-relaxed text-[#5B6661]`}>いま振替できる回はありません。ほかの人のお休みなどで空きが出ると、ここに表示されます。</p>
          ) : (
            <ul className="space-y-3">
              {slots.map((s) => (
                <li key={s.id} className={ui.card}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold">{mdw(s.startsAt)}</p>
                      <p className="text-base">{hm(s.startsAt)}〜{hm(s.endsAt)}</p>
                      <p className="mt-0.5 text-sm text-[#5B6661]">{s.title}・{s.court.name}{s.schoolClass?.level && `・${s.schoolClass.level.name}`}{s.instructor && `・${s.instructor.name}`}</p>
                    </div>
                    {s.left <= 2 ? <Chip tone="warn">残り{s.left}名</Chip> : <Chip tone="ok">残り{s.left}名</Chip>}
                  </div>
                  <div className="mt-3"><Fill taken={s.capacity - s.left} capacity={s.capacity} /></div>
                  <ActionForm action={bookMyMakeup} confirm={`${name}${mdw(s.startsAt)} ${hm(s.startsAt)} の「${s.title}」に振替しますか？`} className="mt-4">
                    <input type="hidden" name="memberId" value={who.id} />
                    <input type="hidden" name="creditId" value={credit.id} />
                    <input type="hidden" name="slotId" value={s.id} />
                    <Submit className={ui.primary}>この回に振替する</Submit>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
