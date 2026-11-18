import Link from "next/link";
import { ActionForm, Submit } from "@/components/ActionForm";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/tokens";
import { PASSWORD_RULE } from "@/lib/password";
import { resetPassword } from "../../actions";

export const metadata = { title: "新しいパスワードの設定" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rec = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  const valid = rec && !rec.usedAt && rec.expiresAt > new Date();
  if (!valid)
    return (
      <>
        <h1 className="mb-2 text-lg font-bold">URLが無効です</h1>
        <p className="text-sm text-slate-600">このURLは無効か、有効期限（1時間）が切れています。</p>
        <Link href="/forgot-password" className="btn-primary mt-4 w-full">再設定をやり直す</Link>
      </>
    );
  return (
    <>
      <h1 className="mb-4 text-lg font-bold">新しいパスワードの設定</h1>
      <ActionForm action={resetPassword} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <label className="block"><span className="label">新しいパスワード</span><input className="input" type="password" name="password" autoComplete="new-password" required minLength={8} /><span className="mt-1 block text-xs text-slate-500">{PASSWORD_RULE}</span></label>
        <label className="block"><span className="label">新しいパスワード（確認）</span><input className="input" type="password" name="confirm" autoComplete="new-password" required /></label>
        <Submit className="btn-primary w-full">設定する</Submit>
      </ActionForm>
    </>
  );
}
