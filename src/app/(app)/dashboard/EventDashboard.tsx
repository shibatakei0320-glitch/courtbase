import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db, facilityModeOn } from "@/lib/db";
import { addDays, fmtTime, fromJst, jstDateKey, yen } from "@/lib/format";

export async function EventDashboard() {
  await requireStaff();
  const today = jstDateKey(new Date());
  const start = fromJst(today);
  const end = fromJst(addDays(today, 1));
  const monthStart = fromJst(today.slice(0, 8) + "01");
  const facility = await facilityModeOn();
  const [slots, activeMembers, inside, monthSales, todaySales, todayRes] = await Promise.all([
    db.slot.findMany({
      where: { startsAt: { gte: start, lt: end }, status: "OPEN" },
      include: { court: true, _count: { select: { reservations: { where: { status: { in: ["RESERVED", "ATTENDED"] } } } } } },
      orderBy: { startsAt: "asc" },
    }),
    db.member.count({ where: { status: "ACTIVE" } }),
    db.visit.count({ where: { checkInAt: { gte: start }, checkOutAt: null } }),
    db.payment.aggregate({ _sum: { amount: true }, where: { paidAt: { gte: monthStart } } }),
    db.payment.aggregate({ _sum: { amount: true }, where: { paidAt: { gte: start, lt: end } } }),
    db.reservation.count({ where: { status: { in: ["RESERVED", "ATTENDED"] }, slot: { startsAt: { gte: start, lt: end } } } }),
  ]);
  const capacity = slots.reduce((s, x) => s + x.capacity, 0);
  return (
    <>
      <PageHeader
        title="今日の状況"
        actions={<>{facility && <Link href="/checkin" className="btn-primary">QRで入退場を受付</Link>}<Link href="/schedule/new" className={facility ? "btn-secondary" : "btn-primary"}>枠を作成</Link></>}
      />
      <div className={`mb-6 grid gap-4 sm:grid-cols-2 ${facility ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        {facility && <EventKpi label="いま在館中" value={`${inside}名`} />}
        <EventKpi label="本日の予約" value={`${todayRes} / ${capacity}`} sub={capacity ? `稼働率 ${Math.round((todayRes / capacity) * 100)}%` : "枠なし"} />
        <EventKpi label="本日の売上" value={yen(todaySales._sum.amount ?? 0)} />
        <EventKpi label="今月の売上" value={yen(monthSales._sum.amount ?? 0)} />
        <EventKpi label="有効会員数" value={`${activeMembers}名`} />
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

function EventKpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
