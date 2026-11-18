import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, fmtTime, fromJst, jstDateKey, yen } from "@/lib/format";

export const metadata = { title: "ダッシュボード" };

export default async function Dashboard() {
  const me = await requireStaff();
  const today = jstDateKey(new Date());
  const start = fromJst(today);
  const end = fromJst(addDays(today, 1));
  const monthStart = fromJst(today.slice(0, 8) + "01");
  const [slots, activeMembers, newMembers, monthSales, todaySales, todayRes] = await Promise.all([
    db.slot.findMany({
      where: { startsAt: { gte: start, lt: end }, status: "OPEN" },
      include: { court: true, _count: { select: { reservations: { where: { status: { in: ["RESERVED", "ATTENDED"] } } } } } },
      orderBy: { startsAt: "asc" },
    }),
    db.member.count({ where: { status: "ACTIVE" } }),
    db.member.count({ where: { joinedAt: { gte: monthStart } } }),
    db.payment.aggregate({ _sum: { amount: true }, where: { paidAt: { gte: monthStart } } }),
    db.payment.aggregate({ _sum: { amount: true }, where: { paidAt: { gte: start, lt: end } } }),
    db.reservation.count({ where: { status: { in: ["RESERVED", "ATTENDED"] }, slot: { startsAt: { gte: start, lt: end } } } }),
  ]);
  const capacity = slots.reduce((s, x) => s + x.capacity, 0);
  return (
    <>
      <PageHeader title={`おはようございます、${me.name}さん`} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="本日の予約" value={`${todayRes} / ${capacity}`} sub={capacity ? `稼働率 ${Math.round((todayRes / capacity) * 100)}%` : "枠なし"} />
        <Kpi label="本日の売上" value={yen(todaySales._sum.amount ?? 0)} />
        <Kpi label="今月の売上" value={yen(monthSales._sum.amount ?? 0)} />
        <Kpi label="有効会員数" value={`${activeMembers}名`} />
        <Kpi label="今月の新規入会" value={`${newMembers}名`} />
      </div>
      <div className="card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">本日のスケジュール</h2>
          <Link href="/schedule" className="text-sm text-brand-700 hover:underline">週表示へ</Link>
        </div>
        {slots.length === 0 ? <Empty>本日の枠はありません</Empty> : (
          <ul className="divide-y">
            {slots.map((s) => {
              const pct = Math.min(100, Math.round((s._count.reservations / s.capacity) * 100));
              return (
                <li key={s.id}>
                  <Link href={`/schedule/${s.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50">
                    <span className="w-24 shrink-0 font-mono text-sm text-slate-500">{fmtTime(s.startsAt)}–{fmtTime(s.endsAt)}</span>
                    <span className="flex-1"><span className="font-medium">{s.title}</span><span className="ml-2 text-xs text-slate-400">{s.court.name}</span></span>
                    <span className="w-24 shrink-0 sm:w-32">
                      <span className="block h-2 rounded-full bg-slate-100"><span className="block h-2 rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></span>
                      <span className="text-xs text-slate-500">{s._count.reservations}/{s.capacity}名</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
