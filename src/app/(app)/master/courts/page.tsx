import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveCourt } from "../actions";
import { yen } from "@/lib/format";

export const metadata = { title: "コート" };

export default async function CourtsPage() {
  await requireStaff(["OWNER", "ADMIN"]);
  const courts = await db.court.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return (
    <>
      <PageHeader title="コート" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card overflow-x-auto lg:col-span-2">
          {courts.length === 0 ? <Empty>コートがありません</Empty> : (
            <table className="table">
              <thead><tr><th>表示順</th><th>コート名</th><th>会員予約</th><th>1時間の料金</th><th>状態</th><th></th></tr></thead>
              <tbody>
                {courts.map((c) => (
                  <tr key={c.id}>
                    <td>{c.sortOrder}</td>
                    <td className="font-medium">{c.name}</td>
                    <td>{c.memberBookable ? <Badge tone="blue">受付中</Badge> : <Badge>受け付けない</Badge>}</td>
                    <td>{c.hourlyPrice > 0 ? yen(c.hourlyPrice) : "無料"}</td>
                    <td>{c.active ? <Badge tone="green">利用可</Badge> : <Badge>停止</Badge>}</td>
                    <td>
                      <details>
                        <summary className="cursor-pointer text-brand-700">編集</summary>
                        <div className="absolute z-10 mt-2 w-80 rounded-lg border bg-white p-4 shadow-lg"><CourtForm court={c} /></div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card p-5"><h2 className="mb-3 font-semibold">新規コート</h2><CourtForm /></div>
      </div>
    </>
  );
}

function CourtForm({ court }: { court?: { id: string; name: string; description: string | null; active: boolean; sortOrder: number; hourlyPrice: number; memberBookable: boolean } }) {
  return (
    <ActionForm action={saveCourt} className="space-y-3" resetOnSuccess={!court}>
      {court && <input type="hidden" name="id" value={court.id} />}
      <label className="block"><span className="label">コート名</span><input className="input" name="name" defaultValue={court?.name} required /></label>
      <label className="block"><span className="label">説明</span><input className="input" name="description" defaultValue={court?.description ?? ""} /></label>
      <label className="block"><span className="label">1時間あたりの料金（円）</span><input className="input" type="number" min={0} step={10} name="hourlyPrice" defaultValue={court?.hourlyPrice ?? 0} /><span className="mt-1 block text-xs text-slate-500">会員が時間を選んで予約するときの料金。0なら無料</span></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="memberBookable" defaultChecked={court?.memberBookable ?? true} />会員ページから時間を選んで予約できる</label>
      <label className="block"><span className="label">表示順</span><input className="input" type="number" name="sortOrder" defaultValue={court?.sortOrder ?? 0} /></label>
      {court && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={court.active} />利用可</label>}
      <Submit>{court ? "更新" : "追加"}</Submit>
    </ActionForm>
  );
}
