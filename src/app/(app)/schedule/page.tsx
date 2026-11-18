import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { SLOT_KIND, addDays, fmtTime, fmtWeekday, fromJst, jstDateKey } from "@/lib/format";

export const metadata = { title: "スケジュール" };

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ date?: string; court?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const ref = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : jstDateKey(new Date());
  // 月曜始まり
  const jstDow = (new Date(fromJst(ref).getTime() + 9 * 3600_000).getUTCDay() + 6) % 7;
  const monday = addDays(ref, -jstDow);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const [courts, slots] = await Promise.all([
    db.court.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.slot.findMany({
      where: { startsAt: { gte: fromJst(monday), lt: fromJst(addDays(monday, 7)) }, ...(sp.court ? { courtId: sp.court } : {}) },
      include: { court: true, program: true, instructor: { select: { name: true } }, _count: { select: { reservations: { where: { status: { in: ["RESERVED", "ATTENDED"] } } } } } },
      orderBy: { startsAt: "asc" },
    }),
  ]);
  const today = jstDateKey(new Date());
  const q = (date: string) => `/schedule?date=${date}${sp.court ? `&court=${sp.court}` : ""}`;
  return (
    <>
      <PageHeader title="スケジュール" actions={<Link href={`/schedule/new?date=${ref}`} className="btn-primary">＋ 枠を作成</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link className="btn-secondary btn-sm" href={q(addDays(monday, -7))}>← 前週</Link>
        <Link className="btn-secondary btn-sm" href={q(today)}>今週</Link>
        <Link className="btn-secondary btn-sm" href={q(addDays(monday, 7))}>次週 →</Link>
        <span className="ml-2 font-semibold">{monday.replaceAll("-", "/")} 〜 {addDays(monday, 6).slice(5).replace("-", "/")}</span>
        <form className="ml-auto flex gap-2">
          <input type="hidden" name="date" value={ref} />
          <select name="court" defaultValue={sp.court ?? ""} className="input py-1">
            <option value="">全コート</option>
            {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn-secondary btn-sm">絞込</button>
        </form>
      </div>
      <div className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const list = slots.filter((s) => jstDateKey(s.startsAt) === d);
          return (
            <div key={d} className={`card min-h-40 p-2 ${d === today ? "ring-2 ring-brand-500" : ""}`}>
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-semibold">{fmtWeekday(fromJst(d))}</span>
                <Link href={`/schedule/new?date=${d}`} className="text-xs text-brand-700 hover:underline" aria-label={`${d}に枠を作成`}>＋</Link>
              </div>
              <ul className="space-y-1.5">
                {list.map((s) => {
                  const full = s._count.reservations >= s.capacity;
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/schedule/${s.id}`}
                        className={`block rounded border-l-4 bg-slate-50 px-2 py-1.5 text-xs hover:bg-slate-100 ${s.status === "CANCELED" ? "opacity-50 line-through" : ""}`}
                        style={{ borderColor: s.program?.color ?? "#64748b" }}
                      >
                        <span className="font-mono text-slate-500">{fmtTime(s.startsAt)}-{fmtTime(s.endsAt)}</span>
                        <span className="block font-medium text-slate-800">{s.title}</span>
                        <span className="flex justify-between text-slate-500">
                          <span>{s.court.name}・{SLOT_KIND[s.kind]}</span>
                          <span className={full ? "font-semibold text-red-600" : ""}>{s._count.reservations}/{s.capacity}</span>
                        </span>
                        {s.instructor && <span className="block text-slate-400">担当 {s.instructor.name}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
}
