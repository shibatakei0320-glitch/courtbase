import { Empty, PageHeader, Pager } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "操作ログ" };
const PER = 100;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  await requireStaff(["OWNER", "ADMIN"]);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = sp.action ? { action: { startsWith: sp.action } } : {};
  const [logs, total] = await Promise.all([
    db.auditLog.findMany({ where, include: { staff: { select: { name: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER, take: PER }),
    db.auditLog.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="操作ログ" />
      <form className="mb-4 flex gap-2">
        <select className="input max-w-xs" name="action" defaultValue={sp.action ?? ""}>
          <option value="">すべて</option>
          {["login", "password", "staff", "member", "slot", "reservation", "payment", "plan", "court", "program", "setting"].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button className="btn-secondary">絞込</button>
      </form>
      <div className="card overflow-x-auto">
        {logs.length === 0 ? <Empty>ログはありません</Empty> : (
          <table className="table">
            <thead><tr><th>日時</th><th>操作者</th><th>操作</th><th>対象</th><th>詳細</th><th>IP</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{fmtDateTime(l.createdAt)}</td><td>{l.staff?.name ?? "-"}</td>
                  <td className="font-mono text-xs">{l.action}</td><td className="max-w-xs truncate">{l.target}</td>
                  <td className="max-w-xs truncate">{l.detail}</td><td className="font-mono text-xs">{l.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pager page={page} total={total} perPage={PER} base={`/audit-logs?action=${sp.action ?? ""}`} />
      </div>
    </>
  );
}
