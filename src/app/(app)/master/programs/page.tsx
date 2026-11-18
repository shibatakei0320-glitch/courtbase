import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { SLOT_KIND, yen } from "@/lib/format";
import type { Program } from "@prisma/client";
import { saveProgram } from "../actions";

export const metadata = { title: "プログラム" };

export default async function ProgramsPage() {
  await requireStaff(["OWNER", "ADMIN"]);
  const programs = await db.program.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <>
      <PageHeader title="プログラム（レッスン・貸切の雛形）" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card overflow-x-auto lg:col-span-2">
          {programs.length === 0 ? <Empty>プログラムがありません</Empty> : (
            <table className="table">
              <thead><tr><th>名称</th><th>種別</th><th>定員</th><th>時間</th><th>料金</th><th>消費チケット</th><th>状態</th><th></th></tr></thead>
              <tbody>
                {programs.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium"><span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: p.color }} />{p.name}</td>
                    <td>{SLOT_KIND[p.kind]}</td>
                    <td>{p.capacity}名</td>
                    <td>{p.durationMin}分</td>
                    <td>{yen(p.price)}</td>
                    <td>{p.ticketCost}</td>
                    <td>{p.active ? <Badge tone="green">有効</Badge> : <Badge>停止</Badge>}</td>
                    <td>
                      <details>
                        <summary className="cursor-pointer text-brand-700">編集</summary>
                        <div className="absolute right-4 z-10 mt-2 w-80 rounded-lg border bg-white p-4 shadow-lg"><ProgramForm program={p} /></div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card p-5"><h2 className="mb-3 font-semibold">新規プログラム</h2><ProgramForm /></div>
      </div>
    </>
  );
}

function ProgramForm({ program: p }: { program?: Program }) {
  return (
    <ActionForm action={saveProgram} className="space-y-3" resetOnSuccess={!p}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <label className="block"><span className="label">名称</span><input className="input" name="name" defaultValue={p?.name} required /></label>
      <label className="block"><span className="label">種別</span>
        <select className="input" name="kind" defaultValue={p?.kind ?? "LESSON"}>
          {Object.entries(SLOT_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="label">定員</span><input className="input" type="number" min={1} name="capacity" defaultValue={p?.capacity ?? 8} /></label>
        <label className="block"><span className="label">時間(分)</span><input className="input" type="number" min={15} step={15} name="durationMin" defaultValue={p?.durationMin ?? 60} /></label>
        <label className="block"><span className="label">料金(円)</span><input className="input" type="number" min={0} name="price" defaultValue={p?.price ?? 0} /></label>
        <label className="block"><span className="label">消費チケット</span><input className="input" type="number" min={0} name="ticketCost" defaultValue={p?.ticketCost ?? 1} /></label>
      </div>
      <label className="block"><span className="label">表示色</span><input className="input h-10" type="color" name="color" defaultValue={p?.color ?? "#2563eb"} /></label>
      <label className="block"><span className="label">説明</span><textarea className="input" name="description" rows={2} defaultValue={p?.description ?? ""} /></label>
      {p && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p.active} />有効</label>}
      <Submit>{p ? "更新" : "追加"}</Submit>
    </ActionForm>
  );
}
