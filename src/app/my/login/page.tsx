import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/member-auth";
import { Court } from "../ui";

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
    <section className="relative flex min-h-[70vh] flex-col justify-end overflow-hidden rounded-2xl bg-[#0F3D2E] px-6 pb-8 pt-40 text-white">
      <Court className="-right-6 -top-10 h-[30rem] rotate-[-8deg]" />
      <div className="relative">
        <h1 className="text-[2rem] font-medium leading-[1.35] tracking-wide">今週も、<br />コートで。</h1>
        <p className="mt-4 max-w-[18rem] text-sm leading-relaxed text-white/65">
          大会・イベントの申込みはLINEでログインして行います。はじめての方は、そのまま会員登録へ進みます。
        </p>
        {error && ERRORS[error] && <p role="alert" className="mt-5 border-l-2 border-[#E4F25C] pl-3 text-sm text-white">{ERRORS[error]}</p>}
        <a href="/api/line/login" className="mt-8 flex w-full items-center justify-center rounded-xl bg-[#06C755] py-4 text-sm font-bold text-white transition hover:bg-[#05b34c] active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          LINEでログイン
        </a>
      </div>
    </section>
  );
}
