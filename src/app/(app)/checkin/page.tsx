import Link from "next/link";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db, facilityModeOn } from "@/lib/db";
import { redirect } from "next/navigation";
import { fmtTime, fromJst, jstDateKey } from "@/lib/format";
import { Scanner } from "./Scanner";

export const metadata = { title: "入退場" };
export const dynamic = "force-dynamic";

export default async function CheckinPage() {
  await requireStaff();
  if (!(await facilityModeOn())) redirect("/dashboard");
  const visits = await db.visit.findMany({
    where: { checkInAt: { gte: fromJst(jstDateKey(new Date())) } },
    include: { member: true },
    orderBy: { checkInAt: "desc" },
  });
  const inside = visits.filter((v) => !v.checkOutAt).length;
  return (
    <>
      <PageHeader title="入退場（QR受付）" />
      <Scanner />
      <div className="mb-3 mt-8 flex items-baseline justify-between">
        <h2 className="font-semibold">本日の入退場</h2>
        <span className="text-sm text-slate-600">在館中 <b className="text-lg">{inside}</b> 名 ／ 本日 {visits.length} 件</span>
      </div>
      <div className="card overflow-x-auto">
        {visits.length === 0 ? <Empty>本日の入場はまだありません</Empty> : (
          <table className="table">
            <thead><tr><th>会員</th><th>入場</th><th>退場</th><th>状態</th></tr></thead>
            <tbody>
              {visits.map((v) => (
                <tr key={v.id}>
                  <td><Link className="text-brand-700 hover:underline" href={`/members/${v.memberId}`}>{v.member.lastName} {v.member.firstName}</Link></td>
                  <td>{fmtTime(v.checkInAt)}</td>
                  <td>{v.checkOutAt ? fmtTime(v.checkOutAt) : "-"}</td>
                  <td>{v.checkOutAt ? <Badge>退場</Badge> : <Badge tone="green">在館中</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
