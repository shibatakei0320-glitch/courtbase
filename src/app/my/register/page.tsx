import { redirect } from "next/navigation";
import { ActionForm, Submit } from "@/components/ActionForm";
import { getCurrentMember, getLinePending } from "@/lib/member-auth";
import { registerMember } from "../actions";

export const metadata = { title: "会員登録" };

const field = "mt-2 block w-full border-0 border-b border-[#13201A]/20 bg-transparent px-0 py-2 text-base text-[#13201A] placeholder:text-[#13201A]/30 focus:border-[#0F3D2E] focus:outline-none focus:ring-0";
const label = "block text-xs text-[#13201A]/60";
const opt = <span className="ml-1 text-[#13201A]/40">任意</span>;

export default async function RegisterPage() {
  if (await getCurrentMember()) redirect("/my");
  const pending = await getLinePending();
  if (!pending) redirect("/my/login?error=state");
  return (
    <div className="space-y-8 pt-2">
      <div className="px-1">
        <h1 className="text-2xl font-medium tracking-wide">会員登録</h1>
        <p className="mt-2 text-sm text-[#13201A]/60">{pending.name ? `${pending.name}さんのLINEと連携します。` : "LINEと連携して登録します。"}</p>
      </div>
      <div className="rounded-2xl bg-white px-6 py-7">
        <ActionForm action={registerMember} className="space-y-7">
          <div className="grid grid-cols-2 gap-x-5 gap-y-7">
            <label className={label}>姓<input className={field} name="lastName" required autoComplete="family-name" /></label>
            <label className={label}>名<input className={field} name="firstName" required autoComplete="given-name" /></label>
            <label className={label}>セイ{opt}<input className={field} name="lastKana" /></label>
            <label className={label}>メイ{opt}<input className={field} name="firstKana" /></label>
          </div>
          <label className={label}>電話番号<input className={field} type="tel" name="phone" required autoComplete="tel" placeholder="090-1234-5678" /></label>
          <label className={label}>メールアドレス{opt}
            <input className={field} type="email" name="email" autoComplete="email" />
            <span className="mt-2 block text-[#13201A]/45">カード決済の領収書の送り先になります。</span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="agree" value="1" required className="mt-0.5 h-4 w-4 accent-[#0F3D2E]" />
            利用規約と個人情報の取扱いに同意します
          </label>
          <Submit className="w-full rounded-xl bg-[#0F3D2E] py-4 text-sm font-bold text-white transition hover:bg-[#0B2F23] active:scale-[0.99] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F3D2E]">
            登録する
          </Submit>
        </ActionForm>
      </div>
    </div>
  );
}
