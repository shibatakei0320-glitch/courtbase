import { ActionForm, Submit } from "@/components/ActionForm";
import { addDays, fromJst, jstDateKey } from "@/lib/format";
import { coolOf, schoolSettings } from "@/lib/school";
import { generateClassLessons } from "./actions";

/** 回の生成フォーム。クール制なら次のクール（3か月）、なしなら来月を既定にする */
export async function GenerateForm({ classId }: { classId?: string }) {
  const { coolMonths, lessonsPerCool } = await schoolSettings();
  const today = jstDateKey(new Date());
  const cur = coolOf(new Date(), coolMonths);
  const next = cur ? coolOf(fromJst(cur.next), coolMonths) : null;
  const [y, m] = today.split("-").map(Number);
  const nextFirst = `${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, "0")}-01`;
  const [ny, nm] = nextFirst.split("-").map(Number);
  const afterFirst = `${nm === 12 ? ny + 1 : ny}-${String((nm % 12) + 1).padStart(2, "0")}-01`;
  const from = next?.start ?? nextFirst;
  const to = next?.last ?? addDays(afterFirst, -1);
  return (
    <ActionForm action={generateClassLessons} className="space-y-3">
      {classId && <input type="hidden" name="classId" value={classId} />}
      {next && <p className="text-sm font-medium">次のクール：{next.label}</p>}
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="label">開始日</span><input className="input" type="date" name="from" defaultValue={from} required /></label>
        <label className="block"><span className="label">終了日</span><input className="input" type="date" name="to" defaultValue={to} required /></label>
      </div>
      <p className="text-xs text-slate-500">
        期間内の該当曜日に回を作り、在籍者の出席予定を入れます（作成済みの日はそのまま）。{next ? `1クールは${lessonsPerCool}回です。曜日によっては${lessonsPerCool}回を超えるので、` : ""}祝日・スクールの休みの回は、作成後に各回の画面で「休講」にしてください（在籍者に振替が付きます）。
      </p>
      <Submit>{classId ? "このクラスの回を作成" : "全クラスの回を作成"}</Submit>
    </ActionForm>
  );
}
