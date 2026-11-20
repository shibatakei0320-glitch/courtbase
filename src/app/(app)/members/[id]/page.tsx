import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { MEMBER_STATUS, PAY_METHOD, RES_STATUS, fmtDate, fmtDateTime, yen } from "@/lib/format";
import { MemberForm } from "../MemberForm";
import { updateMember } from "../actions";

export const metadata = { title: "会員詳細" };

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const member = await db.member.findUnique({
    where: { id },
    include: {
      plan: true,
      reservations: { include: { slot: { include: { court: true } } }, orderBy: { slot: { startsAt: "desc" } }, take: 50 },
      payments: { orderBy: { paidAt: "desc" }, take: 50 },
      visits: { orderBy: { checkInAt: "desc" }, take: 30 },
      enrollments: { include: { schoolClass: { include: { level: true } } }, orderBy: { startDate: "desc" } },
      credits: { where: { status: "AVAILABLE" }, orderBy: { expiresAt: "asc" } },
    },
  });
  if (!member) notFound();
  const plans = await db.plan.findMany({ orderBy: { sortOrder: "asc" } });
  const total = member.payments.reduce((s, p) => s + p.amount, 0);
  return (
    <>
      <PageHeader
        title={`${member.lastName} ${member.firstName}`}
        back="/members"
        actions={<Link className="btn-secondary" href={`/payments?member=${member.id}#new`}>入金登録</Link>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="会員番号" value={String(member.memberNo).padStart(6, "0")} />
        <Stat label="ステータス" value={<span className="flex gap-1"><Badge tone={member.status === "ACTIVE" ? "green" : "yellow"}>{MEMBER_STATUS[member.status]}</Badge>{member.lineUserId && <Badge tone="blue">LINE連携</Badge>}</span>} />
        <Stat label="累計入金" value={yen(total)} />
      </div>
      <div>
        <div className="card p-6">
          <h2 className="mb-4 font-semibold">会員情報</h2>
          <MemberForm action={updateMember} member={member} plans={plans} />
          <p className="mt-4 text-xs text-slate-400">入会日 {fmtDate(member.joinedAt)} ／ 更新 {fmtDateTime(member.updatedAt)}</p>
        </div>
      </div>

      <h2 className="mb-3 mt-8 font-semibold">クラス・振替</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card overflow-x-auto">
          {member.enrollments.length === 0 ? <Empty>在籍しているクラスはありません（<Link className="text-brand-700 underline" href="/classes">クラス</Link>の画面から登録）</Empty> : (
            <table className="table">
              <thead><tr><th>クラス</th><th>在籍期間</th></tr></thead>
              <tbody>
                {member.enrollments.map((e) => {
                  const ended = e.endDate && e.endDate.getTime() + 86400_000 <= Date.now();
                  return (
                    <tr key={e.id} className={ended ? "opacity-50" : ""}>
                      <td><Link className="text-brand-700 hover:underline" href={`/classes/${e.classId}`}>{e.schoolClass.name}</Link>{e.schoolClass.level && <span className="ml-1 text-xs text-slate-500">{e.schoolClass.level.name}</span>}</td>
                      <td className="whitespace-nowrap">{fmtDate(e.startDate)}〜{e.endDate ? fmtDate(e.endDate) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="card p-4">
          {(() => {
            const live = member.credits.filter((c) => c.expiresAt > new Date());
            return (
              <>
                <p className="text-xs text-slate-500">使える振替</p>
                <p className="mt-1 text-lg font-semibold">{live.length}回</p>
                {live.length > 0 && <ul className="mt-2 space-y-1 text-sm text-slate-600">{live.map((c) => <li key={c.id}>{c.reason}・{fmtDate(c.expiresAt)}まで</li>)}</ul>}
                <Link className="mt-3 inline-block text-sm text-brand-700 hover:underline" href={`/makeups?f=all&member=${member.id}`}>振替の管理へ</Link>
              </>
            );
          })()}
        </div>
      </div>

      <h2 className="mb-3 mt-8 font-semibold">予約履歴</h2>
      <div className="card overflow-x-auto">
        {member.reservations.length === 0 ? <Empty>予約はありません</Empty> : (
          <table className="table">
            <thead><tr><th>日時</th><th>内容</th><th>コート</th><th>状態</th></tr></thead>
            <tbody>
              {member.reservations.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDateTime(r.slot.startsAt)}</td>
                  <td><Link className="text-brand-700 hover:underline" href={`/schedule/${r.slotId}`}>{r.slot.title}</Link></td>
                  <td>{r.slot.court.name}</td>
                  <td>{r.kind === "REGULAR" && r.status === "CANCELED" ? "欠席連絡" : RES_STATUS[r.status]}{r.kind === "MAKEUP" && <span className="ml-1"><Badge tone="yellow">振替</Badge></span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="mb-3 mt-8 font-semibold">入退場履歴</h2>
      <div className="card overflow-x-auto">
        {member.visits.length === 0 ? <Empty>入退場の記録はありません</Empty> : (
          <table className="table">
            <thead><tr><th>入場</th><th>退場</th></tr></thead>
            <tbody>
              {member.visits.map((v) => (
                <tr key={v.id}><td>{fmtDateTime(v.checkInAt)}</td><td>{v.checkOutAt ? fmtDateTime(v.checkOutAt) : "-"}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="mb-3 mt-8 font-semibold">入金履歴</h2>
      <div className="card overflow-x-auto">
        {member.payments.length === 0 ? <Empty>入金はありません</Empty> : (
          <table className="table">
            <thead><tr><th>日時</th><th>内容</th><th>方法</th><th className="text-right">金額</th></tr></thead>
            <tbody>
              {member.payments.map((p) => (
                <tr key={p.id}><td>{fmtDateTime(p.paidAt)}</td><td>{p.description}</td><td>{PAY_METHOD[p.method]}</td><td className="text-right">{yen(p.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="card p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>;
}
