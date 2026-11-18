import { redirect } from "next/navigation";
import { ActionForm, Submit } from "@/components/ActionForm";
import { getCurrentMember, getLinePending } from "@/lib/member-auth";
import { registerMember } from "../actions";

export const metadata = { title: "会員登録" };

export default async function RegisterPage() {
  if (await getCurrentMember()) redirect("/my");
  const pending = await getLinePending();
  if (!pending) redirect("/my/login?error=state");
  return (
    <div className="card p-6">
      <h1 className="mb-2 text-lg font-bold">会員登録</h1>
      <p className="mb-4 text-sm text-slate-600">LINE（{pending.name ?? "ログイン済み"}）と連携して会員登録します。</p>
      <ActionForm action={registerMember} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">姓 *</span><input className="input" name="lastName" required autoComplete="family-name" /></label>
          <label className="block"><span className="label">名 *</span><input className="input" name="firstName" required autoComplete="given-name" /></label>
          <label className="block"><span className="label">セイ</span><input className="input" name="lastKana" /></label>
          <label className="block"><span className="label">メイ</span><input className="input" name="firstKana" /></label>
        </div>
        <label className="block"><span className="label">電話番号 *</span><input className="input" type="tel" name="phone" required autoComplete="tel" placeholder="090-1234-5678" /></label>
        <label className="block"><span className="label">メールアドレス</span><input className="input" type="email" name="email" autoComplete="email" /><span className="mt-1 block text-xs text-slate-500">決済の領収メールの送り先になります（任意）</span></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="agree" value="1" className="mt-1" required />利用規約と個人情報の取扱いに同意します</label>
        <Submit className="btn-primary w-full">登録する</Submit>
      </ActionForm>
    </div>
  );
}
