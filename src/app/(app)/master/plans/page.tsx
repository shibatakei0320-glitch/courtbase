import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLAN_KIND, yen } from "@/lib/format";
import { savePlan } from "../actions";

export const metadata = { title: "プラン" };

export default async function PlansPage() {
  await requireStaff(["OWNER", "ADMIN"]);
  const plans = await db.plan.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { _count: { select: { members: true } } } });
  return (
    <>
      <PageHeader title="プラン" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card overflow-x-auto lg:col-span-2">
          {plans.length === 0 ? <Empty>プランがありません</Empty> : (
            <table className="table">
              <thead><tr><th>プラン名</th><th>種別</th><th>料金</th><th>会員数</th><th>状態</th><th></th></tr></thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}</td>
                    <td>{PLAN_KIND[p.kind]}</td>
                    <td>{yen(p.price)}</td>
                    <td>{p._count.members}</td>
                    <td>{p.active ? <Badge tone="green">有効</Badge> : <Badge>停止</Badge>}</td>
                    <td>
                      <details>
                        <summary className="cursor-pointer text-brand-700">編集</summary>
                        <div className="absolute z-10 mt-2 w-80 rounded-lg border bg-white p-4 shadow-lg"><PlanForm plan={p} /></div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">新規プラン</h2>
          <PlanForm />
        </div>
      </div>
    </>
  );
}

type P = { id: string; name: string; kind: keyof typeof PLAN_KIND; price: number; description: string | null; active: boolean; sortOrder: number };
function PlanForm({ plan }: { plan?: P }) {
  return (
    <ActionForm action={savePlan} className="space-y-3" resetOnSuccess={!plan}>
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <label className="block"><span className="label">プラン名</span><input className="input" name="name" defaultValue={plan?.name} required /></label>
      <label className="block"><span className="label">種別</span>
        <select className="input" name="kind" defaultValue={plan?.kind ?? "MONTHLY"}>
          {Object.entries(PLAN_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="block"><span className="label">料金(円)</span><input className="input" type="number" min={0} name="price" defaultValue={plan?.price ?? 0} required /></label>
      <label className="block"><span className="label">説明</span><textarea className="input" name="description" rows={2} defaultValue={plan?.description ?? ""} /></label>
      <label className="block"><span className="label">表示順</span><input className="input" type="number" name="sortOrder" defaultValue={plan?.sortOrder ?? 0} /></label>
      {plan && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={plan.active} />有効</label>}
      <Submit>{plan ? "更新" : "追加"}</Submit>
    </ActionForm>
  );
}
