import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { canManage, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { RES_STATUS, SLOT_KIND, fmtDateTime, fmtTime, jstDateKey, yen } from "@/lib/format";
import { addReservation, cancelSlot, deleteSlot, setReservationStatus, updateSlot } from "../actions";

export const metadata = { title: "枠の詳細" };

const TONE = { RESERVED: "blue", ATTENDED: "green", NO_SHOW: "red", CANCELED: "gray" } as const;

export default async function SlotPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const me = await requireStaff();
  const { id } = await params;
  const { q } = await searchParams;
  const slot = await db.slot.findUnique({
    where: { id },
    include: { court: true, program: true, instructor: true, reservations: { include: { member: { include: { plan: true } } }, orderBy: { createdAt: "asc" } } },
  });
  if (!slot) notFound();
  const [courts, staff] = await Promise.all([
    db.court.findMany({ orderBy: { sortOrder: "asc" } }),
    db.staff.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const activeCount = slot.reservations.filter((r) => r.status === "RESERVED" || r.status === "ATTENDED").length;
  const candidates = q
    ? await db.member.findMany({
        where: {
          status: "ACTIVE",
          OR: [
            { lastName: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } },
            { lastKana: { contains: q } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } },
            ...(Number.isInteger(Number(q)) ? [{ memberNo: Number(q) }] : []),
          ],
        },
        include: { plan: true },
        take: 10,
      })
    : [];
  const duration = Math.round((slot.endsAt.getTime() - slot.startsAt.getTime()) / 60000);
  const canceled = slot.status === "CANCELED";

  return (
    <>
      <PageHeader title={slot.title} back={`/schedule?date=${jstDateKey(slot.startsAt)}`} />
      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
        <span>{fmtDateTime(slot.startsAt)}〜{fmtTime(slot.endsAt)}</span>
        <span>{slot.court.name}</span>
        <span>{SLOT_KIND[slot.kind]}</span>
        <span>予約 {activeCount}/{slot.capacity}</span>
        <span>{yen(slot.price)}</span>
        {slot.instructor && <span>担当 {slot.instructor.name}</span>}
        {canceled && <Badge tone="red">中止</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card overflow-x-auto">
            <h2 className="border-b px-4 py-3 font-semibold">参加者</h2>
            {slot.reservations.length === 0 ? <Empty>予約はまだありません</Empty> : (
              <table className="table">
                <thead><tr><th>会員</th><th>プラン</th><th>予約日時</th><th>状態</th><th>操作</th></tr></thead>
                <tbody>
                  {slot.reservations.map((r) => (
                    <tr key={r.id}>
                      <td><Link href={`/members/${r.memberId}`} className="text-brand-700 hover:underline">{r.member.lastName} {r.member.firstName}</Link></td>
                      <td>{r.member.plan?.name ?? "-"}</td>
                      <td>{fmtDateTime(r.createdAt)}</td>
                      <td><Badge tone={TONE[r.status]}>{RES_STATUS[r.status]}</Badge></td>
                      <td>
                        {r.status !== "CANCELED" && (
                          <div className="flex gap-1">
                            {r.status !== "ATTENDED" && <StatusBtn id={r.id} status="ATTENDED" label="出席" />}
                            {r.status !== "NO_SHOW" && <StatusBtn id={r.id} status="NO_SHOW" label="欠席" />}
                            {r.status !== "RESERVED" && <StatusBtn id={r.id} status="RESERVED" label="予約中に戻す" />}
                            <StatusBtn id={r.id} status="CANCELED" label="取消" danger />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {!canceled && (
            <div className="card p-4">
              <h2 className="mb-3 font-semibold">予約を追加</h2>
              <form className="mb-3 flex gap-2">
                <input className="input" name="q" defaultValue={q} placeholder="会員を検索（氏名・カナ・電話・会員番号）" />
                <button className="btn-secondary">検索</button>
              </form>
              {q && candidates.length === 0 && <p className="text-sm text-slate-500">該当する有効会員がいません</p>}
              <ul className="divide-y">
                {candidates.map((m) => (
                  <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{m.lastName} {m.firstName}<span className="ml-2 text-xs text-slate-400">No.{m.memberNo}・{m.plan?.name ?? "プランなし"}</span></span>
                    <ActionForm action={addReservation}>
                      <input type="hidden" name="slotId" value={slot.id} />
                      <input type="hidden" name="memberId" value={m.id} />
                      <Submit className="btn-primary btn-sm">予約</Submit>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card p-4">
            <h2 className="mb-3 font-semibold">枠の編集</h2>
            <ActionForm action={updateSlot} className="space-y-3">
              <input type="hidden" name="id" value={slot.id} />
              <label className="block"><span className="label">タイトル</span><input className="input" name="title" defaultValue={slot.title} required /></label>
              <label className="block"><span className="label">コート</span>
                <select className="input" name="courtId" defaultValue={slot.courtId}>{courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><span className="label">日付</span><input className="input" type="date" name="date" defaultValue={jstDateKey(slot.startsAt)} /></label>
                <label className="block"><span className="label">開始</span><input className="input" type="time" name="time" step={900} defaultValue={fmtTime(slot.startsAt)} /></label>
                <label className="block"><span className="label">時間(分)</span><input className="input" type="number" name="durationMin" min={15} step={15} defaultValue={duration} /></label>
                <label className="block"><span className="label">定員</span><input className="input" type="number" name="capacity" min={1} defaultValue={slot.capacity} /></label>
                <label className="block"><span className="label">料金</span><input className="input" type="number" name="price" min={0} defaultValue={slot.price} /></label>
              </div>
              <label className="block"><span className="label">担当</span>
                <select className="input" name="instructorId" defaultValue={slot.instructorId ?? ""}>
                  <option value="">なし</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="block"><span className="label">メモ</span><textarea className="input" name="note" rows={2} defaultValue={slot.note ?? ""} /></label>
              <Submit>更新</Submit>
            </ActionForm>
          </div>
          {!canceled && (
            <div className="card p-4">
              <h2 className="mb-2 font-semibold text-red-700">枠の中止</h2>
              <p className="mb-3 text-xs text-slate-500">この枠の予約はすべてキャンセルされます。</p>
              <ActionForm action={cancelSlot} confirm="この枠を中止しますか？">
                <input type="hidden" name="id" value={slot.id} />
                <Submit className="btn-danger">中止する</Submit>
              </ActionForm>
            </div>
          )}
          {canManage(me.role) && slot.reservations.every((r) => r.status === "CANCELED") && (
            <form action={deleteSlot} className="card p-4">
              <input type="hidden" name="id" value={slot.id} />
              <button className="btn-secondary w-full text-red-700">枠を削除</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

function StatusBtn({ id, status, label, danger }: { id: string; status: string; label: string; danger?: boolean }) {
  return (
    <ActionForm action={setReservationStatus} confirm={danger ? "この予約を取り消しますか？" : undefined}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Submit className={`${danger ? "btn-danger" : "btn-secondary"} btn-sm`}>{label}</Submit>
    </ActionForm>
  );
}
