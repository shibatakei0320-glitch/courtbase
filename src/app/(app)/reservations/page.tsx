import Link from "next/link";
import type { Prisma, ReservationStatus } from "@prisma/client";
import { Badge, Empty, PageHeader, Pager } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { RES_STATUS, addDays, fmtDateTime, fromJst, jstDateKey } from "@/lib/format";

export const metadata = { title: "予約一覧" };
const PER = 50;
const TONE = { RESERVED: "blue", ATTENDED: "green", NO_SHOW: "red", CANCELED: "gray" } as const;

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; status?: string; q?: string; page?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const today = jstDateKey(new Date());
  const from = sp.from || today;
  const to = sp.to || addDays(today, 14);
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.ReservationWhereInput = { slot: { startsAt: { gte: fromJst(from), lt: fromJst(addDays(to, 1)) } } };
  if (sp.status && sp.status in RES_STATUS) where.status = sp.status as ReservationStatus;
  if (sp.q) where.member = { OR: [{ lastName: { contains: sp.q } }, { firstName: { contains: sp.q } }, { lastKana: { contains: sp.q } }] };
  const [list, total] = await Promise.all([
    db.reservation.findMany({ where, include: { member: true, slot: { include: { court: true } } }, orderBy: { slot: { startsAt: "asc" } }, skip: (page - 1) * PER, take: PER }),
    db.reservation.count({ where }),
  ]);
  const qs = new URLSearchParams(Object.entries({ from, to, status: sp.status ?? "", q: sp.q ?? "" }).filter(([, v]) => v));
  return (
    <>
      <PageHeader title="予約一覧" />
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <label className="block"><span className="label">開始日</span><input className="input" type="date" name="from" defaultValue={from} /></label>
        <label className="block"><span className="label">終了日</span><input className="input" type="date" name="to" defaultValue={to} /></label>
        <label className="block"><span className="label">状態</span>
          <select className="input" name="status" defaultValue={sp.status ?? ""}>
            <option value="">すべて</option>{Object.entries(RES_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">会員名</span><input className="input" name="q" defaultValue={sp.q} /></label>
        <button className="btn-primary">検索</button>
      </form>
      <div className="card overflow-x-auto">
        {list.length === 0 ? <Empty>該当する予約がありません</Empty> : (
          <table className="table">
            <thead><tr><th>日時</th><th>枠</th><th>コート</th><th>会員</th><th>状態</th><th>予約受付</th></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDateTime(r.slot.startsAt)}</td>
                  <td><Link href={`/schedule/${r.slotId}`} className="text-brand-700 hover:underline">{r.slot.title}</Link></td>
                  <td>{r.slot.court.name}</td>
                  <td><Link href={`/members/${r.memberId}`} className="hover:underline">{r.member.lastName} {r.member.firstName}</Link></td>
                  <td><Badge tone={TONE[r.status]}>{RES_STATUS[r.status]}</Badge></td>
                  <td>{fmtDateTime(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pager page={page} total={total} perPage={PER} base={`/reservations?${qs}`} />
      </div>
    </>
  );
}
