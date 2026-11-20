import Link from "next/link";
import { requireMember } from "@/lib/member-auth";
import { ActionForm, Submit } from "@/components/ActionForm";
import { familyOf } from "@/lib/family";
import { gradeLabel } from "@/lib/school";
import { db } from "@/lib/db";
import { addChild } from "../actions";
import { ui } from "../ui";

export const metadata = { title: "家族の登録" };

export default async function FamilyPage() {
  const me = await requireMember();
  const fam = await familyOf(me);
  const guardian = me.guardianId ? await db.member.findUnique({ where: { id: me.guardianId } }) : null;
  const input = "block w-full rounded-xl border-2 border-[#1A2420]/15 bg-white px-4 py-3 text-base focus:border-[#0B6B4F] focus:outline-none";

  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <Link href="/my" className={`px-1 text-sm ${ui.link}`}>← マイページ</Link>
        <h1 className="px-1 text-2xl font-bold">家族の登録</h1>
        <p className="px-1 text-base leading-relaxed text-[#5B6661]">お子さまを登録すると、このLINE・会員ページから、お子さまのレッスンの欠席連絡や振替予約ができます。お知らせもこのLINEに届きます。</p>
      </div>

      <section>
        <h2 className={ui.h2}>登録されている方</h2>
        <ul className={`${ui.card} divide-y divide-[#1A2420]/10 !py-1`}>
          {fam.map((m, i) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-3">
              <span className="text-base font-bold">{m.lastName} {m.firstName}{gradeLabel(m.birthDate) && <span className="ml-2 text-sm font-normal text-[#5B6661]">{gradeLabel(m.birthDate)}</span>}</span>
              <span className="text-sm text-[#5B6661]">{i === 0 ? (m.guardianId ? "ご本人" : "保護者（ご本人）") : "お子さま"}</span>
            </li>
          ))}
        </ul>
        {guardian && <p className="mt-2 px-1 text-sm text-[#5B6661]">保護者：{guardian.lastName} {guardian.firstName}さん</p>}
      </section>

      {!me.guardianId && (
        <section>
          <h2 className={ui.h2}>お子さまを追加</h2>
          <ActionForm action={addChild} resetOnSuccess className={`${ui.card} space-y-4`}>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="mb-1 block text-sm font-bold">姓</span><input className={input} name="lastName" defaultValue={me.lastName} required /></label>
              <label className="block"><span className="mb-1 block text-sm font-bold">名</span><input className={input} name="firstName" required /></label>
              <label className="block"><span className="mb-1 block text-sm font-bold">セイ</span><input className={input} name="lastKana" defaultValue={me.lastKana ?? ""} /></label>
              <label className="block"><span className="mb-1 block text-sm font-bold">メイ</span><input className={input} name="firstKana" /></label>
            </div>
            <label className="block"><span className="mb-1 block text-sm font-bold">生年月日</span><input className={input} type="date" name="birthDate" required /></label>
            <fieldset>
              <span className="mb-1 block text-sm font-bold">性別（任意）</span>
              <div className="flex gap-5 text-base">
                <label className="flex items-center gap-2"><input type="radio" name="gender" value="male" />男の子</label>
                <label className="flex items-center gap-2"><input type="radio" name="gender" value="female" />女の子</label>
              </div>
            </fieldset>
            <Submit className={ui.primary}>登録する</Submit>
            <p className="text-sm text-[#5B6661]">クラスへのお申し込み（在籍）は、登録のあとスクールで手続きします。LINEでご希望のクラスをお知らせください。</p>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
