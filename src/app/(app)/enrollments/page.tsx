import Link from "next/link";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, yen } from "@/lib/format";
import { WEEKDAYS, monthKey } from "@/lib/school";
import { isMonth, monthLabel, monthRange, shiftMonth } from "@/lib/tuition";

export const metadata = { title: "在籍台帳" };

export default async function EnrollmentsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const month = sp.month && isMonth(sp.month) ? sp.month : monthKey(new Date());
  const { start, end } = monthRange(month);
  const [enrollments, leaves] = await Promise.all([
    db.enrollment.findMany({
      where: { startDate: { lt: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] },
      include: { member: true, schoolClass: { include: { plan: true, level: true } } },
      orderBy: [{ member: { lastKana: "asc" } }, { startDate: "asc" }],
    }),
    db.leave.findMany({ where: { fromMonth: { lte: month }, toMonth: { gte: month } }, include: { member: true } }),
  ]);
  const onLeave = new Set(leaves.map((l) => l.memberId));
  // 会員ごとにまとめる
  const byMember = new Map<string, typeof enrollments>();
  for (const e of enrollments) byMember.set(e.memberId, [...(byMember.get(e.memberId) ?? []), e]);
  const rows = [...byMember.values()];

  // 今月の異動
  const prevIds = new Set((await db.enrollment.findMany({ where: { startDate: { lt: start } }, select: { memberId: true } })).map((e) => e.memberId));
  const moves: { date: Date; kind: string; tone: "green" | "blue" | "red" | "yellow"; who: { id: string; name: string }; detail: string }[] = [];
  for (const e of enrollments) {
    const who = { id: e.memberId, name: `${e.member.lastName} ${e.member.firstName}` };
    const sibling = byMember.get(e.memberId) ?? [];
    if (e.startDate >= start) {
      const from = sibling.find((o) => o.id !== e.id && o.endDate && Math.abs(o.endDate.getTime() + 86400_000 - e.startDate.getTime()) < 86400_000 * 2);
      if (from) moves.push({ date: e.startDate, kind: "クラス変更", tone: "blue", who, detail: `${from.schoolClass.name} → ${e.schoolClass.name}` });
      else moves.push({ date: e.startDate, kind: prevIds.has(e.memberId) ? "クラス追加" : "入会", tone: "green", who, detail: e.schoolClass.name });
    }
    if (e.endDate && e.endDate < end) {
      const to = sibling.find((o) => o.id !== e.id && Math.abs(o.startDate.getTime() - (e.endDate!.getTime() + 86400_000)) < 86400_000 * 2);
      if (!to) moves.push({ date: e.endDate, kind: "退会", tone: "red", who, detail: `${e.schoolClass.name}（${fmtDate(e.endDate)}まで）` });
    }
  }
  for (const l of leaves) if (l.fromMonth === month) moves.push({ date: start, kind: "休会", tone: "yellow", who: { id: l.memberId, name: `${l.member.lastName} ${l.member.firstName}` }, detail: `${l.fromMonth}〜${l.toMonth}${l.reason ? ` ${l.reason}` : ""}` });
  moves.sort((a, b) => a.date.getTime() - b.date.getTime());
  const fee = rows.filter((r) => !onLeave.has(r[0].memberId)).reduce((a, r) => a + r.filter((e) => !e.endDate || e.endDate >= end).reduce((x, e) => x + (e.schoolClass.plan?.price ?? 0), 0), 0);

  return (
    <>
      <PageHeader
        title="在籍台帳"
        actions={
          <div className="flex items-center gap-2">
            <Link className="btn-secondary btn-sm" href={`/enrollments?month=${shiftMonth(month, -1)}`}>←</Link>
            <span className="text-sm font-medium">{monthLabel(month)}</span>
            <Link className="btn-secondary btn-sm" href={`/enrollments?month=${shiftMonth(month, 1)}`}>→</Link>
            <Link className="btn-secondary btn-sm" href={`/tuition?month=${month}`}>この月の月謝</Link>
          </div>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="在籍者" value={`${rows.length}名`} />
        <Stat label="休会中" value={`${leaves.length}名`} />
        <Stat label="新規入会" value={`${moves.filter((m) => m.kind === "入会").length}名`} />
        <Stat label="月謝（月末時点の満額）" value={yen(fee)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card overflow-x-auto lg:col-span-2">
          <h2 className="border-b px-4 py-3 font-semibold">在籍者一覧</h2>
          {rows.length === 0 ? <Empty>この月の在籍者はいません</Empty> : (
            <table className="table">
              <thead><tr><th>会員</th><th>クラス</th><th className="text-right">月謝</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const m = r[0].member;
                  return (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap">
                        <Link className="text-brand-700 hover:underline" href={`/members/${m.id}`}>{m.lastName} {m.firstName}</Link>
                        {onLeave.has(m.id) && <span className="ml-1"><Badge tone="yellow">休会</Badge></span>}
                        {m.status !== "ACTIVE" && <span className="ml-1"><Badge tone="red">{m.status === "SUSPENDED" ? "停止" : "退会"}</Badge></span>}
                      </td>
                      <td className="text-sm">
                        {r.map((e) => (
                          <span key={e.id} className="block">
                            {WEEKDAYS[e.schoolClass.weekday]} {e.schoolClass.startTime} {e.schoolClass.name}
                            {e.startDate >= start && <span className="ml-1 text-xs text-emerald-700">{fmtDate(e.startDate).slice(5)}〜</span>}
                            {e.endDate && e.endDate < end && <span className="ml-1 text-xs text-red-700">〜{fmtDate(e.endDate).slice(5)}</span>}
                          </span>
                        ))}
                      </td>
                      <td className="whitespace-nowrap text-right text-sm">{onLeave.has(m.id) ? "休会" : yen(r.reduce((a, e) => a + (e.schoolClass.plan?.price ?? 0), 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h2 className="border-b px-4 py-3 font-semibold">{monthLabel(month)}の異動</h2>
          {moves.length === 0 ? <Empty>異動はありません</Empty> : (
            <ul className="divide-y">
              {moves.map((m, i) => (
                <li key={i} className="px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge tone={m.tone}>{m.kind}</Badge>
                    <Link className="text-brand-700 hover:underline" href={`/members/${m.who.id}`}>{m.who.name}</Link>
                    <span className="ml-auto text-xs text-slate-500">{fmtDate(m.date).slice(5)}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{m.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="card p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>;
}
