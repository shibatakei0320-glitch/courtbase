import Link from "next/link";
import { requireMember } from "@/lib/member-auth";
import { ActionForm, Submit } from "@/components/ActionForm";
import { jstDateKey } from "@/lib/format";
import { familyMember, familyOf } from "@/lib/family";
import { freeCandidates, freePlansOf, freeUsed, gradeLabel } from "@/lib/school";
import { bookMyFree } from "../../actions";
import { Chip, FamilyTabs, hm, mdw, ui } from "../../ui";

export const metadata = { title: "フリーコースの予約" };

export default async function FreePage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const me = await requireMember();
  const sp = await searchParams;
  const fam = await familyOf(me);
  // 指定がなければ、フリーに登録している最初の人
  let who = sp.m ? await familyMember(me, sp.m) : null;
  if (!who) for (const f of fam) if ((await freePlansOf(f.id)).length) { who = f; break; }
  who ??= me;
  const plans = await freePlansOf(who.id);
  const slots = plans.length ? await freeCandidates(who.id) : [];
  const months = [...new Set(slots.map((s) => jstDateKey(s.startsAt).slice(0, 7)))];
  const used = Object.fromEntries(await Promise.all(months.map(async (m) => [m, await freeUsed(who!.id, m)] as const)));
  const max = Math.max(0, ...plans.map((p) => p.max));
  const thisMonth = jstDateKey(new Date()).slice(0, 7);
  const usedNow = used[thisMonth] ?? (plans.length ? await freeUsed(who.id, thisMonth) : 0);
  const tabs = fam.map((f) => ({ id: f.id, firstName: f.firstName, grade: gradeLabel(f.birthDate) }));

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href={`/my/school?m=${who.id}`} className={`px-1 text-sm ${ui.link}`}>← レッスン予定</Link>
        <h1 className="px-1 text-2xl font-bold">{fam.length > 1 ? `${who.firstName}さんの` : ""}フリーコース</h1>
        <FamilyTabs fam={tabs} current={who.id} base="/my/school/free" />
      </div>
      {!plans.length ? (
        <p className={`${ui.card} text-base leading-relaxed text-[#5B6661]`}>フリーコースに登録されていません。登録クラスとその下のレベルのクラスに、月の上限回数まで自由に参加できるコースです。ご希望の方はスクールにご相談ください。</p>
      ) : (
        <>
          <div className={ui.card}>
            <p className="text-base">今月の利用 <b className="text-2xl">{usedNow}</b> / {max}回</p>
            <p className="mt-1 text-sm text-[#5B6661]">{plans.map((p) => p.label).join("、")}。登録している段階とその下のレベルの回から選べます。</p>
          </div>
          {slots.length === 0 ? (
            <p className={`${ui.card} text-base text-[#5B6661]`}>いま予約できる回はありません。</p>
          ) : (
            <ul className="space-y-3">
              {slots.map((s) => {
                const m = jstDateKey(s.startsAt).slice(0, 7);
                const full = (used[m] ?? 0) >= max;
                return (
                  <li key={s.id} className={ui.card}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold">{mdw(s.startsAt)}</p>
                        <p className="text-base">{hm(s.startsAt)}〜{hm(s.endsAt)}</p>
                        <p className="mt-0.5 text-sm text-[#5B6661]">{s.title}・{s.court.name}{s.instructor && `・${s.instructor.name}`}</p>
                      </div>
                      {s.left <= 2 ? <Chip tone="warn">残り{s.left}名</Chip> : <Chip tone="ok">残り{s.left}名</Chip>}
                    </div>
                    {full ? (
                      <p className="mt-3 text-sm text-[#5B6661]">{Number(m.slice(5))}月は上限（{max}回）に達しています</p>
                    ) : (
                      <ActionForm action={bookMyFree} confirm={`${mdw(s.startsAt)} ${hm(s.startsAt)} の回を予約しますか？`} className="mt-4">
                        <input type="hidden" name="memberId" value={who!.id} />
                        <input type="hidden" name="slotId" value={s.id} />
                        <Submit className={ui.primary}>この回を予約する</Submit>
                      </ActionForm>
                    )}
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
