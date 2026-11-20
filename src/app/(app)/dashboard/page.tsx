import Link from "next/link";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db, facilityModeOn } from "@/lib/db";
import { addDays, fmtTime, fromJst, jstDateKey, yen } from "@/lib/format";
import { monthKey } from "@/lib/school";

export const metadata = { title: "ダッシュボード" };

export default async function Dashboard() {
  await requireStaff();
  const today = jstDateKey(new Date());
  const start = fromJst(today);
  const end = fromJst(addDays(today, 1));
  const monthStart = fromJst(today.slice(0, 8) + "01");
  const month = monthKey(new Date());
  const facility = await facilityModeOn();
  const [slots, enrolled, inbox, unpaid, monthSales, inside, credits] = await Promise.all([
    db.slot.findMany({
      where: { startsAt: { gte: start, lt: end } },
      include: { court: true, schoolClass: true, reservations: { select: { kind: true, status: true } } },
      orderBy: { startsAt: "asc" },
    }),
    db.enrollment.findMany({ where: { startDate: { lt: end }, OR: [{ endDate: null }, { endDate: { gte: start } }], member: { status: "ACTIVE" } }, select: { memberId: true } }),
    db.lineContact.count({ where: { needsReply: true } }),
    db.invoice.aggregate({ _sum: { amount: true }, _count: true, where: { month, status: "UNPAID" } }),
    db.payment.aggregate({ _sum: { amount: true }, where: { paidAt: { gte: monthStart } } }),
    facility ? db.visit.count({ where: { checkInAt: { gte: start }, checkOutAt: null } }) : Promise.resolve(0),
    db.makeupCredit.count({ where: { status: "AVAILABLE", expiresAt: { gt: new Date() } } }),
  ]);
  const active = (r: { status: string }) => r.status === "RESERVED" || r.status === "ATTENDED";
  const lessons = slots.filter((s) => s.classId);
  const others = slots.filter((s) => !s.classId && s.status === "OPEN");
  const absentToday = lessons.reduce((a, s) => a + s.reservations.filter((r) => r.kind === "REGULAR" && r.status === "CANCELED").length, 0);
  const makeupToday = lessons.reduce((a, s) => a + s.reservations.filter((r) => r.kind === "MAKEUP" && active(r)).length, 0);

  return (
    <>
      <PageHeader
        title="今日の状況"
        actions={<>{facility && <Link href="/checkin" className="btn-secondary">QRで入退場を受付</Link>}<Link href="/inbox" className="btn-primary">LINE受信箱{inbox > 0 ? `（${inbox}）` : ""}</Link></>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="今日のレッスン" value={`${lessons.filter((s) => s.status === "OPEN").length}回`} sub={`欠席連絡 ${absentToday}名・振替参加 ${makeupToday}名`} href="/schedule" />
        <Kpi label="LINE 要対応" value={`${inbox}件`} sub={inbox ? "返信が必要なメッセージがあります" : "対応待ちはありません"} href="/inbox" tone={inbox ? "text-red-700" : ""} />
        <Kpi label="在籍者" value={`${new Set(enrolled.map((e) => e.memberId)).size}名`} sub={`未使用の振替 ${credits}回`} href="/enrollments" />
        <Kpi label="今月の月謝 未入金" value={yen(unpaid._sum.amount ?? 0)} sub={`${unpaid._count}件・今月の売上 ${yen(monthSales._sum.amount ?? 0)}`} href={`/tuition?month=${month}&f=UNPAID`} tone={unpaid._count ? "text-amber-700" : ""} />
      </div>
      {facility && <p className="mb-4 text-sm text-slate-600">いま在館中：{inside}名</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-semibold">今日のレッスン</h2>
            <Link href="/classes" className="text-sm text-brand-700 hover:underline">クラス一覧へ</Link>
          </div>
          {lessons.length === 0 ? <Empty>今日のレッスンはありません</Empty> : (
            <ul className="divide-y">
              {lessons.map((s) => {
                const act = s.reservations.filter(active);
                const absent = s.reservations.filter((r) => r.kind === "REGULAR" && r.status === "CANCELED").length;
                const makeup = act.filter((r) => r.kind === "MAKEUP").length;
                return (
                  <li key={s.id}>
                    <Link href={`/schedule/${s.id}`} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-slate-50 ${s.status === "CANCELED" ? "opacity-60" : ""}`}>
                      <span className="w-28 shrink-0 font-mono text-sm text-slate-500">{fmtTime(s.startsAt)}–{fmtTime(s.endsAt)}</span>
                      <span className="min-w-0 flex-1">
                        {s.schoolClass?.target === "JUNIOR" && <span className="mr-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">ジュニア</span>}
                        <span className="font-medium">{s.title}</span><span className="ml-2 text-xs text-slate-400">{s.court.name}</span>
                      </span>
                      {s.status === "CANCELED" ? <Badge tone="red">休講</Badge> : (
                        <span className="flex gap-3 text-sm">
                          <span>出席予定 <b>{act.length}</b>/{s.capacity}</span>
                          {absent > 0 && <span className="text-slate-500">欠席 {absent}</span>}
                          {makeup > 0 && <span className="text-amber-700">振替 {makeup}</span>}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-semibold">そのほかの予定</h2>
            <Link href="/schedule" className="text-sm text-brand-700 hover:underline">週表示へ</Link>
          </div>
          {others.length === 0 ? <Empty>今日はありません</Empty> : (
            <ul className="divide-y">
              {others.map((s) => (
                <li key={s.id}>
                  <Link href={`/schedule/${s.id}`} className="block px-4 py-3 hover:bg-slate-50">
                    <span className="font-mono text-sm text-slate-500">{fmtTime(s.startsAt)}</span>
                    <span className="ml-3 font-medium">{s.title}</span>
                    <span className="ml-2 text-xs text-slate-500">{s.reservations.filter(active).length}/{s.capacity}名</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, sub, href, tone = "" }: { label: string; value: string; sub?: string; href: string; tone?: string }) {
  return (
    <Link href={href} className="card block p-4 hover:ring-2 hover:ring-brand-500/30">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </Link>
  );
}
