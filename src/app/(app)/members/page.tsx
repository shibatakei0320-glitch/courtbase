import Link from "next/link";
import type { MemberStatus, Prisma } from "@prisma/client";
import { Badge, Empty, PageHeader, Pager } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { MEMBER_STATUS, fmtDate } from "@/lib/format";

export const metadata = { title: "会員管理" };
const PER = 30;

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; plan?: string; page?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();
  const where: Prisma.MemberWhereInput = {};
  if (q) {
    const no = Number(q);
    where.OR = [
      { lastName: { contains: q, mode: "insensitive" } },
      { firstName: { contains: q, mode: "insensitive" } },
      { lastKana: { contains: q } },
      { firstKana: { contains: q } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      ...(Number.isInteger(no) ? [{ memberNo: no }] : []),
    ];
  }
  if (sp.status && sp.status in MEMBER_STATUS) where.status = sp.status as MemberStatus;
  if (sp.plan) where.planId = sp.plan;
  const [members, total, plans] = await Promise.all([
    db.member.findMany({ where, include: { plan: true }, orderBy: { memberNo: "desc" }, skip: (page - 1) * PER, take: PER }),
    db.member.count({ where }),
    db.plan.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const qs = new URLSearchParams(Object.entries({ q: q ?? "", status: sp.status ?? "", plan: sp.plan ?? "" }).filter(([, v]) => v));
  return (
    <>
      <PageHeader title="会員管理" actions={<>
        <a href={`/members/export?${qs}`} className="btn-secondary">CSV出力</a>
        <Link href="/members/new" className="btn-primary">＋ 新規会員登録</Link>
      </>} />
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <label className="block flex-1 min-w-48"><span className="label">キーワード</span><input className="input" name="q" defaultValue={q} placeholder="氏名・カナ・メール・電話・会員番号" /></label>
        <label className="block"><span className="label">ステータス</span>
          <select className="input" name="status" defaultValue={sp.status ?? ""}>
            <option value="">すべて</option>
            {Object.entries(MEMBER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">プラン</span>
          <select className="input" name="plan" defaultValue={sp.plan ?? ""}>
            <option value="">すべて</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <button className="btn-primary">検索</button>
      </form>
      <div className="card overflow-x-auto">
        {members.length === 0 ? <Empty>該当する会員がいません</Empty> : (
          <table className="table">
            <thead><tr><th>会員番号</th><th>氏名</th><th>メール</th><th>電話</th><th>プラン</th><th>チケット</th><th>ステータス</th><th>入会日</th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="font-mono">{String(m.memberNo).padStart(6, "0")}</td>
                  <td><Link href={`/members/${m.id}`} className="font-medium text-brand-700 hover:underline">{m.lastName} {m.firstName}</Link>
                    {m.lastKana && <span className="ml-2 text-xs text-slate-400">{m.lastKana} {m.firstKana}</span>}</td>
                  <td>{m.email ?? "-"}</td>
                  <td>{m.phone ?? "-"}</td>
                  <td>{m.plan?.name ?? "-"}</td>
                  <td>{m.tickets}</td>
                  <td><Badge tone={m.status === "ACTIVE" ? "green" : m.status === "SUSPENDED" ? "yellow" : "gray"}>{MEMBER_STATUS[m.status]}</Badge></td>
                  <td>{fmtDate(m.joinedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pager page={page} total={total} perPage={PER} base={`/members?${qs}`} />
      </div>
    </>
  );
}
