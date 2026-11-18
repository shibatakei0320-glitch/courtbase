import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/member-auth";

export const metadata = { title: "ログイン" };

const ERRORS: Record<string, string> = {
  config: "LINEログインの準備中です。しばらくお待ちください",
  state: "ログインの有効期限が切れました。もう一度お試しください",
  line: "LINEログインに失敗しました。もう一度お試しください",
  withdrawn: "このアカウントは退会済みです。施設スタッフにお問い合わせください",
};

export default async function MemberLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentMember()) redirect("/my");
  const { error } = await searchParams;
  return (
    <div className="card mx-auto max-w-sm p-6 text-center">
      <h1 className="mb-2 text-lg font-bold">会員ログイン</h1>
      <p className="mb-6 text-sm text-slate-600">LINEアカウントでログインします。はじめての方はログイン後に会員登録へ進みます。</p>
      {error && ERRORS[error] && <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{ERRORS[error]}</div>}
      <a href="/api/line/login" className="btn w-full bg-[#06C755] text-white hover:bg-[#05b34c]">LINEでログイン</a>
    </div>
  );
}
