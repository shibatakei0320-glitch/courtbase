import Link from "next/link";
import { Dela_Gothic_One, Zen_Kaku_Gothic_New } from "next/font/google";
import { db } from "@/lib/db";
import { getCurrentMember } from "@/lib/member-auth";
import { memberLogout } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "pickleland", template: "%s | pickleland" } };

const display = Dela_Gothic_One({ weight: "400", subsets: ["latin"], preload: false, variable: "--font-display", display: "swap" });
const body = Zen_Kaku_Gothic_New({ weight: ["400", "500", "700"], subsets: ["latin"], preload: false, display: "swap" });

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const [setting, me] = await Promise.all([db.setting.findUnique({ where: { id: 1 } }), getCurrentMember()]);
  return (
    <div className={`${body.className} ${display.variable} min-h-screen bg-[#EEF2F8] text-[#111C3A]`}>
      <header className="mx-auto flex max-w-xl items-center justify-between gap-3 px-5 py-4">
        <Link href="/my" className="font-display text-lg tracking-wide text-[#1E47B8]">{setting?.facilityName ?? "pickleland"}</Link>
        {me && (
          <form action={memberLogout} className="flex items-center gap-3 text-sm">
            <span className="text-[#111C3A]/70">{me.lastName} {me.firstName}さん</span>
            <button className="rounded-full px-2 py-1 text-[#111C3A]/50 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E47B8]">ログアウト</button>
          </form>
        )}
      </header>
      <main className="mx-auto max-w-xl px-4 pb-28">{children}</main>
    </div>
  );
}
