import { ActionForm, Submit } from "@/components/ActionForm";
import type { Court, Level, Plan, SchoolClass } from "@prisma/client";
import { WEEKDAYS } from "@/lib/school";
import { saveClass } from "./actions";

export function ClassForm({ c, levels, courts, coaches, plans }: { c?: SchoolClass; levels: Level[]; courts: Court[]; coaches: { id: string; name: string }[]; plans: Plan[] }) {
  return (
    <ActionForm action={saveClass} className="space-y-3">
      {c && <input type="hidden" name="id" value={c.id} />}
      <fieldset>
        <span className="label">対象</span>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5"><input type="radio" name="target" value="ADULT" defaultChecked={(c?.target ?? "ADULT") === "ADULT"} />成人</label>
          <label className="flex items-center gap-1.5"><input type="radio" name="target" value="JUNIOR" defaultChecked={c?.target === "JUNIOR"} />ジュニア</label>
        </div>
      </fieldset>
      <fieldset>
        <span className="label">コース</span>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5"><input type="radio" name="course" value="ENJOY" defaultChecked={(c?.course ?? "ENJOY") === "ENJOY"} />エンジョイ</label>
          <label className="flex items-center gap-1.5"><input type="radio" name="course" value="ACADEMY" defaultChecked={c?.course === "ACADEMY"} />アカデミー</label>
        </div>
      </fieldset>
      <label className="block"><span className="label">クラス名</span><input className="input" name="name" defaultValue={c?.name} placeholder="例：初級 月曜10時" required /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="label">曜日</span>
          <select className="input" name="weekday" defaultValue={c?.weekday ?? 1}>
            {WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}曜日</option>)}
          </select>
        </label>
        <label className="block"><span className="label">開始時刻</span><input className="input" type="time" name="startTime" step={300} defaultValue={c?.startTime ?? "10:00"} required /></label>
        <label className="block"><span className="label">時間(分)</span><input className="input" type="number" min={15} step={15} name="durationMin" defaultValue={c?.durationMin ?? 90} /></label>
        <label className="block"><span className="label">定員</span><input className="input" type="number" min={1} name="capacity" defaultValue={c?.capacity ?? 8} /></label>
      </div>
      <label className="block"><span className="label">段階（アカデミー）</span>
        <select className="input" name="levelId" defaultValue={c?.levelId ?? ""}>
          <option value="">（なし）</option>
          {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      <label className="block"><span className="label">標準の受講プラン（月謝）</span>
        <select className="input" name="planId" defaultValue={c?.planId ?? ""}>
          <option value="">（未設定）</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}（¥{p.price.toLocaleString()}）</option>)}
        </select>
        <span className="mt-1 block text-xs text-slate-500">在籍登録のときに、会員ごとに月8回・フリーなどへ変えられます</span>
      </label>
      <label className="block"><span className="label">コート</span>
        <select className="input" name="courtId" defaultValue={c?.courtId ?? courts[0]?.id} required>
          {courts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </label>
      <label className="block"><span className="label">担当コーチ</span>
        <select className="input" name="coachId" defaultValue={c?.coachId ?? ""}>
          <option value="">（未定）</option>
          {coaches.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </label>
      <label className="block"><span className="label">説明（会員ページに表示）</span><textarea className="input" name="description" rows={2} defaultValue={c?.description ?? ""} /></label>
      {c && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={c.active} />開講中</label>}
      <Submit>{c ? "更新" : "クラスを作成"}</Submit>
    </ActionForm>
  );
}
