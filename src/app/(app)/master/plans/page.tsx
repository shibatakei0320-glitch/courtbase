import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLAN_KIND, yen } from "@/lib/format";
import { savePlan } from "../actions";
import { SCHOOL } from "@/lib/brand";
import { COURSE_LABEL } from "@/lib/school";

export const metadata = { title: "プラン" };

export default async function PlansPage() {
  await requireStaff(["OWNER", "ADMIN"]);
  const [plans, levels] = await Promise.all([
    db.plan.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { level: true, _count: { select: { members: true, enrollments: true } } } }),
    db.level.findMany({ orderBy: { rank: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="プラン" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card overflow-x-auto lg:col-span-2">
          {plans.length === 0 ? <Empty>プランがありません</Empty> : (
            <table className="table">
              <thead><tr><th>プラン名</th><th>種別</th><th>料金</th><th>{SCHOOL ? "受講" : "会員数"}</th><th>状態</th><th></th></tr></thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}{SCHOOL && p.course && <span className="block text-xs font-normal text-slate-500">{p.target === "JUNIOR" ? "ジュニア" : p.target === "ADULT" ? "成人" : ""} {COURSE_LABEL[p.course]}{p.level ? `・${p.level.name}` : ""}・{p.freeMax ? `フリー（月${p.freeMax}回まで）` : p.lessonsPerMonth ? `月${p.lessonsPerMonth}回` : ""}{p.extraDiscount ? `・2クラス目から${yen(p.extraDiscount)}引き` : ""}</span>}</td>
                    <td>{PLAN_KIND[p.kind]}</td>
                    <td>{yen(p.price)}</td>
                    <td>{SCHOOL ? `${p._count.enrollments}件` : p._count.members}</td>
                    <td>{p.active ? <Badge tone="green">有効</Badge> : <Badge>停止</Badge>}</td>
                    <td>
                      <details>
                        <summary className="cursor-pointer text-brand-700">編集</summary>
                        <div className="absolute z-10 mt-2 w-80 rounded-lg border bg-white p-4 shadow-lg"><PlanForm plan={p} levels={levels} /></div>
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
          <PlanForm levels={levels} />
        </div>
      </div>
    </>
  );
}

type P = { id: string; name: string; kind: keyof typeof PLAN_KIND; price: number; description: string | null; active: boolean; sortOrder: number; course: string | null; target: "ADULT" | "JUNIOR" | null; levelId: string | null; lessonsPerMonth: number | null; freeMax: number | null; extraDiscount: number };
function PlanForm({ plan, levels }: { plan?: P; levels: { id: string; name: string }[] }) {
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
      {SCHOOL && (
        <fieldset className="space-y-2 rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold text-slate-600">スクールの受講プラン</legend>
          <div className="grid grid-cols-2 gap-2">
            <select className="input" name="target" defaultValue={plan?.target ?? ""}><option value="">対象</option><option value="JUNIOR">ジュニア</option><option value="ADULT">成人</option></select>
            <select className="input" name="course" defaultValue={plan?.course ?? ""}><option value="">コース</option><option value="ENJOY">エンジョイ</option><option value="ACADEMY">アカデミー</option></select>
            <select className="input" name="levelId" defaultValue={plan?.levelId ?? ""}><option value="">段階（なし）</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            <select className="input" name="freq" defaultValue={plan?.freeMax ? "free" : plan?.lessonsPerMonth ? String(plan.lessonsPerMonth) : ""}><option value="">回数（なし）</option><option value="4">月4回（週1クラス）</option><option value="8">月8回（週2クラス）</option><option value="free">フリー</option></select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="label">フリーの上限（月）</span><input className="input" type="number" min={1} name="freeMax" defaultValue={plan?.freeMax ?? ""} /></label>
            <label className="block"><span className="label">2クラス目以降の割引</span><input className="input" type="number" min={0} name="extraDiscount" defaultValue={plan?.extraDiscount ?? 0} /></label>
          </div>
        </fieldset>
      )}
      <label className="block"><span className="label">説明</span><textarea className="input" name="description" rows={2} defaultValue={plan?.description ?? ""} /></label>
      <label className="block"><span className="label">表示順</span><input className="input" type="number" name="sortOrder" defaultValue={plan?.sortOrder ?? 0} /></label>
      {plan && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={plan.active} />有効</label>}
      <Submit>{plan ? "更新" : "追加"}</Submit>
    </ActionForm>
  );
}
