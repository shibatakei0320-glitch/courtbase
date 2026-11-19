import Link from "next/link";
import { requireStaff, ROLE_LABEL, canManage } from "@/lib/auth";
import { db } from "@/lib/db";
import { Nav, type NavItem } from "@/components/Nav";
import { logout } from "../(auth)/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff();
  const setting = await db.setting.findUnique({ where: { id: 1 } });
  const items: NavItem[] = [
    { href: "/dashboard", label: "ダッシュボード" },
    ...(setting?.facilityMode ? [{ href: "/checkin", label: "入退場（QR）" }] : []),
    { href: "/schedule", label: "スケジュール" },
    { href: "/reservations", label: "予約一覧" },
    { href: "/members", label: "会員" },
    { href: "/payments", label: "売上" },
  ];
  if (canManage(me.role)) {
    if (me.role === "OWNER") items.push({ href: "/settings", label: "施設設定", section: "設定" });
    items.push(
      { href: "/master/courts", label: "コート", section: "設定" },
      { href: "/master/programs", label: "プログラム", section: "設定" },
      { href: "/master/plans", label: "会員プラン", section: "設定" },
      { href: "/staff", label: "スタッフ", section: "設定" },
      { href: "/audit-logs", label: "操作ログ", section: "設定" },
    );
  }

  return (
    <div className="min-h-screen md:flex">
      <aside className="relative flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 md:sticky md:top-0 md:block md:h-screen md:w-60 md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r md:px-3 md:py-4">
        <Link href="/dashboard" className="flex items-center gap-2 md:mb-4 md:px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">P</span>
          <span className="truncate font-bold">{setting?.facilityName ?? "pickleland"}</span>
        </Link>
        <Nav items={items} />
      </aside>
      <div className="flex-1 min-w-0">
        <header className="flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-4 py-2 text-sm md:px-8">
          <span className="text-slate-600">{me.name}<span className="ml-2 text-xs text-slate-400">{ROLE_LABEL[me.role]}</span></span>
          <Link href="/password" className="text-slate-600 hover:text-slate-900">パスワード変更</Link>
          <form action={logout}><button className="btn-secondary btn-sm">ログアウト</button></form>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
