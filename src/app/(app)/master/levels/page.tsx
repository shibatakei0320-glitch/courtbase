import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Level } from "@prisma/client";
import { saveLevel } from "../../classes/actions";

export const metadata = { title: "レベル" };

export default async function LevelsPage() {
  await requireStaff(["OWNER", "ADMIN"]);
  const levels = await db.level.findMany({ orderBy: [{ rank: "asc" }, { createdAt: "asc" }], include: { _count: { select: { classes: true } } } });
  return (
    <>
      <PageHeader title="レベル" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card overflow-x-auto lg:col-span-2">
          {levels.length === 0 ? <Empty>レベルがありません（例：入門 1 / 初級 2 / 中級 3 / 上級 4）</Empty> : (
            <table className="table">
              <thead><tr><th>名称</th><th>段階</th><th>クラス数</th><th>状態</th><th></th></tr></thead>
              <tbody>
                {levels.map((l) => (
                  <tr key={l.id}>
                    <td className="font-medium"><span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: l.color }} />{l.name}</td>
                    <td>{l.rank}</td>
                    <td>{l._count.classes}</td>
                    <td>{l.active ? <Badge tone="green">有効</Badge> : <Badge>停止</Badge>}</td>
                    <td>
                      <details>
                        <summary className="cursor-pointer text-brand-700">編集</summary>
                        <div className="absolute right-4 z-10 mt-2 w-72 rounded-lg border bg-white p-4 shadow-lg"><LevelForm level={l} /></div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">新しいレベル</h2>
          <LevelForm />
          <p className="mt-4 text-xs leading-relaxed text-slate-500">「段階」は数字が大きいほど上級です。振替先の制限（施設設定の「振替できるレベル」）に使います。</p>
        </div>
      </div>
    </>
  );
}

function LevelForm({ level: l }: { level?: Level }) {
  return (
    <ActionForm action={saveLevel} className="space-y-3" resetOnSuccess={!l}>
      {l && <input type="hidden" name="id" value={l.id} />}
      <label className="block"><span className="label">名称</span><input className="input" name="name" defaultValue={l?.name} required /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="label">段階</span><input className="input" type="number" min={0} name="rank" defaultValue={l?.rank ?? 1} /></label>
        <label className="block"><span className="label">表示色</span><input className="input h-10" type="color" name="color" defaultValue={l?.color ?? "#2563eb"} /></label>
      </div>
      {l && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={l.active} />有効</label>}
      <Submit>{l ? "更新" : "追加"}</Submit>
    </ActionForm>
  );
}
