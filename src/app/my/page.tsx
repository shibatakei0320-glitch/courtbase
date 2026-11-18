import Link from "next/link";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/member-auth";
import { Badge, Empty } from "@/components/ui";
import { fmtTime, fmtWeekday, yen } from "@/lib/format";

export const metadata = { title: "マイページ" };

export default async function MyPage({ searchParams }: { searchParams: Promise<{ paid?: string; applied?: string }> }) {
  const me = await requireMember();
  const sp = await searchParams;
  const now = new Date();
  const [mine, events] = await Promise.all([
    db.reservation.findMany({
      where: { memberId: me.id, status: "RESERVED", slot: { endsAt: { gte: now } } },
      include: { slot: { include: { court: true } } },
      orderBy: { slot: { startsAt: "asc" } },
    }),
    db.slot.findMany({
      where: { kind: "EVENT", status: "OPEN", startsAt: { gt: now } },
      include: { _count: { select: { reservations: { where: { status: { in: ["RESERVED", "ATTENDED"] } } } } } },
      orderBy: { startsAt: "asc" },
      take: 50,
    }),
  ]);
  const myIds = new Set(mine.map((r) => r.slotId));
  return (
    <>
      {sp.paid && (
        <div role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          お支払いが完了しました。申込みの反映まで数秒かかることがあります（表示されない場合はページを再読み込みしてください）。
        </div>
      )}
      {sp.applied && <div role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">お申込みが完了しました。</div>}

      <h2 className="mb-3 font-semibold">申込み済み</h2>
      <div className="card mb-8">
        {mine.length === 0 ? <Empty>申込み済みの予定はありません</Empty> : (
          <ul className="divide-y">
            {mine.map((r) => (
              <li key={r.id} className="px-4 py-3 text-sm">
                <p className="font-medium">{r.slot.title}</p>
                <p className="text-slate-500">{fmtWeekday(r.slot.startsAt)} {fmtTime(r.slot.startsAt)}〜{fmtTime(r.slot.endsAt)}・{r.slot.court.name}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2 className="mb-3 font-semibold">大会・イベント</h2>
      <div className="card">
        {events.length === 0 ? <Empty>募集中の大会・イベントはありません</Empty> : (
          <ul className="divide-y">
            {events.map((s) => {
              const left = s.capacity - s._count.reservations;
              return (
                <li key={s.id}>
                  <Link href={`/my/events/${s.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50">
                    <div>
                      <p className="font-medium">{s.title}</p>
                      <p className="text-slate-500">{fmtWeekday(s.startsAt)} {fmtTime(s.startsAt)}〜{fmtTime(s.endsAt)}・{s.price > 0 ? yen(s.price) : "無料"}</p>
                    </div>
                    {myIds.has(s.id) ? <Badge tone="green">申込み済み</Badge> : left > 0 ? <Badge tone="blue">残り{left}名</Badge> : <Badge>満員</Badge>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="mt-6 text-xs text-slate-500">お申込み後のキャンセル・返金は施設スタッフまでお問い合わせください。</p>
    </>
  );
}
