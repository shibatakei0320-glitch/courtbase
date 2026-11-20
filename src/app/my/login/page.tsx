import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { BRAND } from "@/lib/brand";
import { getCurrentMember } from "@/lib/member-auth";
import { Court, ui } from "../ui";

export const metadata = { title: "ログイン" };

const ERRORS: Record<string, string> = {
  config: "LINEログインの準備中です。しばらくしてからもう一度お試しください。",
  state: "ログインの有効期限が切れました。もう一度「LINEでログイン」を押してください。",
  line: "LINEでのログインが完了しませんでした。もう一度お試しください。",
  withdrawn: "このアカウントは退会済みです。スクールにお問い合わせください。",
};

export default async function MemberLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentMember()) redirect("/my");
  const { error } = await searchParams;
  const name = (await db.setting.findUnique({ where: { id: 1 } }))?.facilityName ?? BRAND;
  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl bg-[#0B6B4F] px-6 pb-7 pt-10 text-white">
        <Court className="-right-8 -top-6 h-[18rem] rotate-[-8deg]" />
        <div className="relative">
          <p className="text-sm font-bold text-[#E3F04B]">会員ページ</p>
          <h1 className="mt-2 text-2xl font-bold leading-snug">{name}</h1>
          <p className="mt-3 text-base leading-relaxed text-white/85">レッスンのお休みの連絡、振替の予約、月謝の確認ができます。</p>
        </div>
      </section>

      {error && ERRORS[error] && <p role="alert" className="rounded-xl border-l-4 border-[#C2410C] bg-white px-4 py-3 text-base">{ERRORS[error]}</p>}

      <div className={`${ui.card} space-y-4`}>
        <a href="/api/line/login" className="flex w-full items-center justify-center rounded-xl bg-[#06C755] py-4 text-lg font-bold text-white transition hover:bg-[#05b34c] active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#06C755]">
          LINEでログイン
        </a>
        <ul className="space-y-2 text-sm leading-relaxed text-[#5B6661]">
          <li>・はじめての方は、ログインのあと会員登録に進みます。</li>
          <li>・ジュニアの保護者の方は、保護者ご本人のLINEでログインし、「家族の登録」からお子さまを追加してください。</li>
        </ul>
      </div>
    </div>
  );
}
