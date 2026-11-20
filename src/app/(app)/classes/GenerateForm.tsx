import { ActionForm, Submit } from "@/components/ActionForm";
import { addDays, jstDateKey } from "@/lib/format";
import { generateClassLessons } from "./actions";

/** 来月1日〜末日を既定にした、回の生成フォーム */
export function GenerateForm({ classId }: { classId?: string }) {
  const today = jstDateKey(new Date());
  const [y, m] = today.split("-").map(Number);
  const nextFirst = `${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, "0")}-01`;
  const [ny, nm] = nextFirst.split("-").map(Number);
  const afterFirst = `${nm === 12 ? ny + 1 : ny}-${String((nm % 12) + 1).padStart(2, "0")}-01`;
  return (
    <ActionForm action={generateClassLessons} className="space-y-3">
      {classId && <input type="hidden" name="classId" value={classId} />}
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="label">開始日</span><input className="input" type="date" name="from" defaultValue={nextFirst} required /></label>
        <label className="block"><span className="label">終了日</span><input className="input" type="date" name="to" defaultValue={addDays(afterFirst, -1)} required /></label>
      </div>
      <p className="text-xs text-slate-500">期間内の該当曜日に回を作り、在籍者の出席予定を入れます。作成済みの日はそのままです。祝日など休みの回は、作成後に各回の画面で「休講」にしてください（在籍者に振替の権利が付きます）。</p>
      <Submit>{classId ? "このクラスの回を作成" : "全クラスの回を作成"}</Submit>
    </ActionForm>
  );
}
