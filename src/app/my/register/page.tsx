import { redirect } from "next/navigation";
import { ActionForm, Submit } from "@/components/ActionForm";
import { getCurrentMember, getLinePending } from "@/lib/member-auth";
import { registerMember } from "../actions";
import { Ball } from "../ui";

export const metadata = { title: "会員登録" };

const field = "mt-1.5 block w-full rounded-2xl border-0 bg-[#EEF2F8] px-4 py-3 text-base text-[#111C3A] placeholder:text-[#111C3A]/35 focus:outline-none focus:ring-2 focus:ring-[#1E47B8]";
const label = "block text-sm font-bold";

export default async function RegisterPage() {
  if (await getCurrentMember()) redirect("/my");
  const pending = await getLinePending();
  if (!pending) redirect("/my/login?error=state");
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 px-1">
        <Ball size={44} />
        <div>
          <h1 className="font-display text-2xl">はじめまして</h1>
          <p className="text-sm text-[#111C3A]/60">{pending.name ? `${pending.name}さん、` : ""}あと少しで登録できます</p>
        </div>
      </div>
      <div className="rounded-[2rem] bg-white p-6">
        <ActionForm action={registerMember} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>姓<input className={field} name="lastName" required autoComplete="family-name" /></label>
            <label className={label}>名<input className={field} name="firstName" required autoComplete="given-name" /></label>
            <label className={label}>セイ<span className="ml-1 font-normal text-[#111C3A]/50">任意</span><input className={field} name="lastKana" /></label>
            <label className={label}>メイ<span className="ml-1 font-normal text-[#111C3A]/50">任意</span><input className={field} name="firstKana" /></label>
          </div>
          <label className={label}>電話番号<input className={field} type="tel" name="phone" required autoComplete="tel" placeholder="090-1234-5678" /></label>
          <label className={label}>メールアドレス<span className="ml-1 font-normal text-[#111C3A]/50">任意</span>
            <input className={field} type="email" name="email" autoComplete="email" />
            <span className="mt-1.5 block text-xs font-normal text-[#111C3A]/55">カード決済の領収書の送り先になります。</span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="agree" value="1" required className="mt-0.5 h-5 w-5 rounded accent-[#1E47B8]" />
            利用規約と個人情報の取扱いに同意します
          </label>
          <Submit className="w-full rounded-full bg-[#D9F24A] py-4 text-base font-bold text-[#111C3A] transition active:scale-[0.98] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E47B8]">
            登録してはじめる
          </Submit>
        </ActionForm>
      </div>
    </div>
  );
}
