import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Submit } from "@/components/ActionForm";
import { getCurrentStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { login } from "../actions";

export const metadata = { title: "ログイン" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const sp = await searchParams;
  if (await getCurrentStaff()) redirect("/dashboard");
  if (process.env.DATABASE_URL && (await db.staff.count()) === 0) redirect("/setup");
  return (
    <>
      <h1 className="mb-4 text-lg font-bold">ログイン</h1>
      {sp.reset && <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">パスワードを再設定しました。新しいパスワードでログインしてください。</p>}
      <ActionForm action={login} className="space-y-4">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <label className="block"><span className="label">メールアドレス</span><input className="input" type="email" name="email" autoComplete="username" required autoFocus /></label>
        <label className="block"><span className="label">パスワード</span><input className="input" type="password" name="password" autoComplete="current-password" required /></label>
        <Submit className="btn-primary w-full">ログイン</Submit>
      </ActionForm>
      <p className="mt-4 text-center text-sm"><Link href="/forgot-password" className="text-brand-700 hover:underline">パスワードをお忘れの方</Link></p>
    </>
  );
}
