import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/member-auth";
import { Ball, CourtLines } from "../ui";

export const metadata = { title: "ログイン" };

const ERRORS: Record<string, string> = {
  config: "LINEログインの準備中です。しばらくしてからもう一度お試しください。",
  state: "ログインの有効期限が切れました。もう一度「LINEでログイン」を押してください。",
  line: "LINEでのログインが完了しませんでした。もう一度お試しください。",
  withdrawn: "このアカウントは退会済みです。施設スタッフにお問い合わせください。",
};

export default async function MemberLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentMember()) redirect("/my");
  const { error } = await searchParams;
  return (
    <section className="relative overflow-hidden rounded-[2rem] bg-[#1E47B8] px-6 pb-8 pt-10 text-white">
      <CourtLines />
      <div className="relative">
        <Ball size={72} className="pl-bounce" />
        <h1 className="mt-6 font-display text-[2.4rem] leading-[1.2]">コートで<br />会いましょう</h1>
        <p className="mt-4 max-w-[19rem] text-sm leading-relaxed text-white/85">
          大会・イベントの申込みは、LINEアカウントでログインして行います。はじめての方は、ログインのあとに会員登録へ進みます。
        </p>
        {error && ERRORS[error] && <p role="alert" className="mt-5 rounded-2xl bg-white px-4 py-3 text-sm font-medium text-rose-700">{ERRORS[error]}</p>}
        <a href="/api/line/login" className="mt-8 flex w-full items-center justify-center rounded-full bg-[#06C755] py-4 text-base font-bold text-white shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)] transition hover:bg-[#05b34c] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          LINEでログイン
        </a>
      </div>
    </section>
  );
}
