import Link from "next/link";
import { db } from "@/lib/db";
import { fromJst, jstDateKey } from "@/lib/format";
import { gradeLabel } from "@/lib/school";

/** フリーコースの会員（クラスに属さない別枠）。プランごとに、今月の利用回数と一緒に */
export async function FreeMembers() {
  const now = new Date();
  const month = jstDateKey(now).slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const start = fromJst(`${month}-01`);
  const end = fromJst(`${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, "0")}-01`);
  const list = await db.enrollment.findMany({
    where: { classId: null, plan: { freeMax: { not: null } }, OR: [{ endDate: null }, { endDate: { gte: now } }], member: { status: "ACTIVE" } },
    include: { plan: true, member: true },
    orderBy: [{ plan: { sortOrder: "asc" } }, { member: { lastKana: "asc" } }],
  });
  if (!list.length) return null;
  const used = await db.reservation.groupBy({
    by: ["memberId"],
    where: { kind: "FREE", status: { in: ["RESERVED", "ATTENDED"] }, memberId: { in: list.map((e) => e.memberId) }, slot: { startsAt: { gte: start, lt: end } } },
    _count: true,
  });
  const usedOf = new Map(used.map((u) => [u.memberId, u._count]));
  const groups = new Map<string, typeof list>();
  for (const e of list) groups.set(e.plan!.name, [...(groups.get(e.plan!.name) ?? []), e]);
  return (
    <div className="card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-semibold">フリーコース（クラスに属さない別枠）　{list.length}名</h2>
        <span className="text-xs text-slate-500">{Number(month.slice(5))}月の利用回数</span>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        {[...groups.entries()].map(([name, es]) => (
          <div key={name}>
            <p className="mb-1 text-sm font-semibold text-blue-800">{name}</p>
            <ul className="space-y-0.5 text-sm">
              {es.map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span><Link className="text-brand-700 hover:underline" href={`/members/${e.memberId}`}>{e.member.lastName} {e.member.firstName}</Link>{gradeLabel(e.member.birthDate) && <span className="ml-1 text-xs text-slate-500">{gradeLabel(e.member.birthDate)}</span>}</span>
                  <span className="text-xs text-slate-600">{usedOf.get(e.memberId) ?? 0}/{e.plan!.freeMax}回</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
