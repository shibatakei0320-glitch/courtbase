import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { MEMBER_STATUS, PAY_METHOD, RES_STATUS, fmtDate, fmtDateTime, yen } from "@/lib/format";
import { MemberForm } from "../MemberForm";
import { EnrollmentPanel } from "./EnrollmentPanel";
import { FamilyPanel } from "./FamilyPanel";
import { gradeLabel } from "@/lib/school";
import { updateMember } from "../actions";

export const metadata = { title: "会員詳細" };

export default async function MemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ gq?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const { gq } = await searchParams;
  const member = await db.member.findUnique({
    where: { id },
    include: {
      plan: true,
      reservations: { include: { slot: { include: { court: true } } }, orderBy: { slot: { startsAt: "desc" } }, take: 50 },
      payments: { orderBy: { paidAt: "desc" }, take: 50 },
      visits: { orderBy: { checkInAt: "desc" }, take: 30 },
    },
  });
  if (!member) notFound();
  const plans = await db.plan.findMany({ orderBy: { sortOrder: "asc" } });
  const contact = member.lineUserId ? await db.lineContact.findUnique({ where: { lineUserId: member.lineUserId } }) : null;
  const total = member.payments.reduce((s, p) => s + p.amount, 0);
  return (
    <>
      <PageHeader
        title={`${member.lastName} ${member.firstName}${gradeLabel(member.birthDate) ? `（${gradeLabel(member.birthDate)}）` : ""}`}
        back="/members"
        actions={<>{contact && <Link className="btn-secondary" href={`/inbox/${contact.id}?f=all`}>LINEの会話</Link>}<Link className="btn-secondary" href={`/payments?member=${member.id}#new`}>入金登録</Link></>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="会員番号" value={String(member.memberNo).padStart(6, "0")} />
        <Stat label="ステータス" value={<span className="flex gap-1"><Badge tone={member.status === "ACTIVE" ? "green" : "yellow"}>{MEMBER_STATUS[member.status]}</Badge>{member.lineUserId && <Badge tone="blue">LINE連携</Badge>}</span>} />
        <Stat label="累計入金" value={yen(total)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <h2 className="mb-4 font-semibold">会員情報</h2>
          <MemberForm action={updateMember} member={member} plans={plans} />
          <p className="mt-4 text-xs text-slate-400">入会日 {fmtDate(member.joinedAt)} ／ 更新 {fmtDateTime(member.updatedAt)}</p>
        </div>
        <div><FamilyPanel memberId={member.id} gq={gq} /></div>
      </div>

      <h2 className="mb-3 mt-8 font-semibold">在籍管理</h2>
      <EnrollmentPanel memberId={member.id} />

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
