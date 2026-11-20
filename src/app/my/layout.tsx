import Link from "next/link";
import { Barlow_Condensed, Zen_Kaku_Gothic_New } from "next/font/google";
import { db } from "@/lib/db";
import { BRAND, BRAND_MARK } from "@/lib/brand";
import { getCurrentMember } from "@/lib/member-auth";
import { memberLogout } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: BRAND, template: `%s | ${BRAND}` } };

const num = Barlow_Condensed({ weight: ["500", "600"], subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Zen_Kaku_Gothic_New({ weight: ["400", "500", "700"], subsets: ["latin"], preload: false, display: "swap" });

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const [setting, me] = await Promise.all([db.setting.findUnique({ where: { id: 1 } }), getCurrentMember()]);
  const name = setting?.facilityName ?? BRAND;
  return (
    <div className={`${body.className} ${num.variable} min-h-screen bg-[#F4F6F3] text-base text-[#1A2420] antialiased`}>
      <header className="sticky top-0 z-20 border-b border-[#1A2420]/10 bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/my" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg bg-[#0B6B4F] px-1.5 text-sm font-bold tracking-tight text-[#E3F04B]">{BRAND_MARK}</span>
            <span className="truncate text-base font-bold">{name}</span>
          </Link>
          {me && (
            <form action={memberLogout} className="flex shrink-0 items-center gap-3 text-sm">
              <span className="hidden text-[#5B6661] sm:inline">{me.lastName} {me.firstName}さん</span>
              <button className="rounded-lg px-2 py-1 text-[#5B6661] hover:bg-[#1A2420]/5 hover:text-[#1A2420]">ログアウト</button>
            </form>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-8 pt-5">{children}</main>
      <footer className="mx-auto flex max-w-xl flex-wrap gap-x-5 gap-y-2 px-5 pb-32 pt-4 text-sm text-[#5B6661] print:hidden">
        <Link href="/my/legal/terms" className="hover:text-[#1A2420]">利用規約</Link>
        <Link href="/my/legal/privacy" className="hover:text-[#1A2420]">プライバシーポリシー</Link>
        <Link href="/my/legal/tokushoho" className="hover:text-[#1A2420]">特定商取引法に基づく表記</Link>
      </footer>
    </div>
  );
}
