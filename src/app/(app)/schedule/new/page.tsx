import { ActionForm, Submit } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { SLOT_KIND, jstDateKey } from "@/lib/format";
import { createSlot } from "../actions";

export const metadata = { title: "枠の作成" };

export default async function NewSlotPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const [courts, programs, staff] = await Promise.all([
    db.court.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.program.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.staff.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="スケジュール枠の作成" back="/schedule" />
      <div className="card max-w-3xl p-6">
        <ActionForm action={createSlot} className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className="label">プログラム</span>
            <select className="input" name="programId" defaultValue="">
              <option value="">指定なし（手入力）</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}（{SLOT_KIND[p.kind]}・定員{p.capacity}・{p.durationMin}分）</option>)}
            </select>
            <span className="mt-1 block text-xs text-slate-500">プログラムを選ぶと、空欄の項目はプログラムの既定値が使われます</span>
          </label>
          <label className="block sm:col-span-2"><span className="label">タイトル</span><input className="input" name="title" placeholder="空欄ならプログラム名" /></label>
          <label className="block"><span className="label">種別</span>
            <select className="input" name="kind" defaultValue="">
              <option value="">プログラムに従う</option>
              {Object.entries(SLOT_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">コート *</span>
            <select className="input" name="courtId" required>
              {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">日付 *</span><input className="input" type="date" name="date" defaultValue={sp.date ?? jstDateKey(new Date())} required /></label>
          <label className="block"><span className="label">開始時刻 *</span><input className="input" type="time" name="time" step={900} defaultValue="10:00" required /></label>
          <label className="block"><span className="label">時間(分)</span><input className="input" type="number" name="durationMin" min={15} step={15} placeholder="既定値" /></label>
          <label className="block"><span className="label">定員</span><input className="input" type="number" name="capacity" min={1} placeholder="既定値" /></label>
          <label className="block"><span className="label">料金(円)</span><input className="input" type="number" name="price" min={0} placeholder="既定値" /></label>
          <label className="block"><span className="label">担当スタッフ</span>
            <select className="input" name="instructorId" defaultValue="">
              <option value="">なし</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">毎週繰り返し（回数）</span><input className="input" type="number" name="repeatWeeks" min={1} max={26} defaultValue={1} /></label>
          <label className="block sm:col-span-2"><span className="label">メモ</span><textarea className="input" name="note" rows={2} /></label>
          <div className="sm:col-span-2"><Submit>作成する</Submit></div>
        </ActionForm>
      </div>
    </>
  );
}
