import { ActionForm, Submit } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { PASSWORD_RULE } from "@/lib/password";
import { changePassword } from "../../(auth)/actions";

export const metadata = { title: "パスワード変更" };

export default async function PasswordPage() {
  const me = await requireStaff();
  return (
    <div className="max-w-lg">
      <PageHeader title="パスワード変更" />
      {me.mustChangePassword && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          初回ログインまたは管理者による再設定のため、パスワードの変更が必要です。
        </p>
      )}
      <div className="card p-6">
        <ActionForm action={changePassword} className="space-y-4" resetOnSuccess>
          <label className="block"><span className="label">現在のパスワード</span><input className="input" type="password" name="current" autoComplete="current-password" required /></label>
          <label className="block"><span className="label">新しいパスワード</span><input className="input" type="password" name="password" autoComplete="new-password" required minLength={8} /><span className="mt-1 block text-xs text-slate-500">{PASSWORD_RULE}</span></label>
          <label className="block"><span className="label">新しいパスワード（確認）</span><input className="input" type="password" name="confirm" autoComplete="new-password" required /></label>
          <Submit>変更する</Submit>
        </ActionForm>
      </div>
    </div>
  );
}
