import Link from "next/link";
import { Barlow_Condensed, Zen_Kaku_Gothic_New } from "next/font/google";
import { db } from "@/lib/db";
import { getCurrentMember } from "@/lib/member-auth";
import { memberLogout } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "pickleland", template: "%s | pickleland" } };

const num = Barlow_Condensed({ weight: ["500", "600"], subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Zen_Kaku_Gothic_New({ weight: ["400", "500", "700"], subsets: ["latin"], preload: false, display: "swap" });

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const [setting, me] = await Promise.all([db.setting.findUnique({ where: { id: 1 } }), getCurrentMember()]);
  return (
    <div className={`${body.className} ${num.variable} min-h-screen bg-[#F2F3F0] text-[#13201A] antialiased`}>
      <header className="mx-auto flex max-w-xl items-center justify-between gap-3 px-5 pb-3 pt-5">
        <Link href="/my" className="font-display text-xl font-semibold tracking-[0.04em] text-[#0F3D2E]">{setting?.facilityName ?? "pickleland"}</Link>
        {me && (
          <form action={memberLogout} className="flex items-center gap-4 text-xs">
            <span className="text-[#13201A]/60">{me.lastName} {me.firstName}</span>
            <button className="text-[#13201A]/45 hover:text-[#13201A] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-[#0F3D2E]">ログアウト</button>
          </form>
        )}
      </header>
      <main className="mx-auto max-w-xl px-4 pb-8">{children}</main>
      <footer className="mx-auto flex max-w-xl flex-wrap gap-x-5 gap-y-2 px-5 pb-32 pt-4 text-xs text-[#13201A]/45">
        <Link href="/my/legal/terms" className="hover:text-[#13201A]">利用規約</Link>
        <Link href="/my/legal/privacy" className="hover:text-[#13201A]">プライバシーポリシー</Link>
        <Link href="/my/legal/tokushoho" className="hover:text-[#13201A]">特定商取引法に基づく表記</Link>
      </footer>
    </div>
  );
}
