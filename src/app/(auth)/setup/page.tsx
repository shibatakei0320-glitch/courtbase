import { redirect } from "next/navigation";
import { ActionForm, Submit } from "@/components/ActionForm";
import { db } from "@/lib/db";
import { PASSWORD_RULE } from "@/lib/password";
import { setupOwner } from "./actions";

export const metadata = { title: "初期設定" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!process.env.DATABASE_URL)
    return <p className="text-sm text-red-700">データベースが未接続です。Vercel の Storage で Neon を接続し、再デプロイしてください。</p>;
  if ((await db.staff.count()) > 0) redirect("/login");
  return (
    <>
      <h1 className="mb-2 text-lg font-bold">初期設定</h1>
      <p className="mb-4 text-sm text-slate-600">最初の管理者（オーナー）アカウントを作成します。この画面は最初の1回だけ表示されます。</p>
      <ActionForm action={setupOwner} className="space-y-4">
        <label className="block"><span className="label">施設名</span><input className="input" name="facilityName" placeholder="例: ○○ピックルボール" /></label>
        <label className="block"><span className="label">氏名</span><input className="input" name="name" required /></label>
        <label className="block"><span className="label">メールアドレス（ログインID）</span><input className="input" type="email" name="email" autoComplete="username" required /></label>
        <label className="block"><span className="label">パスワード</span><input className="input" type="password" name="password" autoComplete="new-password" required minLength={8} /><span className="mt-1 block text-xs text-slate-500">{PASSWORD_RULE}</span></label>
        <label className="block"><span className="label">パスワード（確認）</span><input className="input" type="password" name="confirm" autoComplete="new-password" required /></label>
        <Submit className="btn-primary w-full">作成してログイン</Submit>
      </ActionForm>
    </>
  );
}
