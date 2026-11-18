import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentMember } from "@/lib/member-auth";
import { memberLogout } from "./actions";

export const dynamic = "force-dynamic";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const [setting, me] = await Promise.all([db.setting.findUnique({ where: { id: 1 } }), getCurrentMember()]);
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/my" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">P</span>
            <span className="font-bold">{setting?.facilityName ?? "pickleland"}</span>
          </Link>
          {me && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-600">{me.lastName} {me.firstName} さん</span>
              <form action={memberLogout}><button className="btn-secondary btn-sm">ログアウト</button></form>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}
