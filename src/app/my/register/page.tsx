import { SCHOOL } from "@/lib/brand";
import { redirect } from "next/navigation";
import { ActionForm, Submit } from "@/components/ActionForm";
import { getCurrentMember, getLinePending } from "@/lib/member-auth";
import { registerMember } from "../actions";

export const metadata = { title: "会員登録" };

const field = "mt-1.5 block w-full rounded-xl border-2 border-[#1A2420]/15 bg-white px-4 py-3 text-base text-[#1A2420] placeholder:text-[#1A2420]/30 focus:border-[#0B6B4F] focus:outline-none";
const label = "block text-sm font-bold text-[#1A2420]";
const opt = <span className="ml-1 font-normal text-[#5B6661]">任意</span>;

export default async function RegisterPage() {
  if (await getCurrentMember()) redirect("/my");
  const pending = await getLinePending();
  if (!pending) redirect("/my/login?error=state");
  return (
    <div className="space-y-8 pt-2">
      <div className="px-1">
        <h1 className="text-2xl font-bold">会員登録</h1>
        <p className="mt-2 text-base leading-relaxed text-[#5B6661]">{pending.name ? `${pending.name}さんのLINEと連携します。` : "LINEと連携して登録します。"}すでに会員の方は、登録済みの氏名・電話番号を入れると、会員情報とつながります。</p>
        {SCHOOL && <p className="mt-2 text-sm leading-relaxed text-[#5B6661]">ジュニアの保護者の方は、まず保護者ご本人の情報を登録してください。お子さまは登録のあと「家族の登録」から追加できます。</p>}
      </div>
      <div className="rounded-2xl bg-white px-5 py-6">
        <ActionForm action={registerMember} className="space-y-5">
          <div className="grid grid-cols-2 gap-x-3 gap-y-5">
            <label className={label}>姓<input className={field} name="lastName" required autoComplete="family-name" /></label>
            <label className={label}>名<input className={field} name="firstName" required autoComplete="given-name" /></label>
            <label className={label}>セイ{opt}<input className={field} name="lastKana" /></label>
            <label className={label}>メイ{opt}<input className={field} name="firstKana" /></label>
          </div>
          <label className={label}>電話番号<input className={field} type="tel" name="phone" required autoComplete="tel" placeholder="090-1234-5678" /></label>
          <label className={label}>メールアドレス{opt}
            <input className={field} type="email" name="email" autoComplete="email" />
            <span className="mt-1.5 block text-sm font-normal text-[#5B6661]">お支払いの領収書の送り先になります。</span>
          </label>
          <label className="flex items-start gap-3 text-base">
            <input type="checkbox" name="agree" value="1" required className="mt-0.5 h-4 w-4 accent-[#0B6B4F]" />
            <span><a href="/my/legal/terms" target="_blank" className="underline underline-offset-2">利用規約</a>と<a href="/my/legal/privacy" target="_blank" className="underline underline-offset-2">プライバシーポリシー</a>に同意します</span>
          </label>
          <Submit className="w-full rounded-xl bg-[#0B6B4F] py-4 text-base font-bold text-white transition hover:bg-[#08553F] active:scale-[0.99] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B6B4F]">
            登録する
          </Submit>
        </ActionForm>
      </div>
    </div>
  );
}
