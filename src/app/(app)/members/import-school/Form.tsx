"use client";
import { useActionState } from "react";
import { runImport, type State } from "./actions";

export function ImportForm() {
  const [state, action, pending] = useActionState<State, FormData>(runImport, undefined);
  const r = state?.report;
  return (
    <div className="space-y-6">
      <form action={action} className="card space-y-4 p-5">
        <label className="block"><span className="label">CSVファイル</span><input className="block w-full text-sm" type="file" name="file" accept=".csv,text/csv" required /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="dryRun" defaultChecked />確認だけ（まだ登録しない）</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="generate" defaultChecked />レッスンの回も作る（今のクラスは12月末まで、1月からのクラスは冬クール）</label>
        <button className="btn-primary" disabled={pending}>{pending ? "処理中…" : "取り込む"}</button>
        {state?.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      </form>
      {r && (
        <div className="card space-y-3 p-5 text-sm">
          <h2 className="font-semibold">{r.dryRun ? "確認の結果（まだ登録していません）" : "取り込みました"}</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>会員：新しく{r.members.created}名・登録済み{r.members.existing}名</li>
            <li>12月までのクラスへの在籍：{r.enrollCurrent}件{r.classesCreated.length > 0 && `（クラスを${r.classesCreated.length}つ作成）`}</li>
            <li>1月からのクラスへの在籍：{r.enrollJan}件</li>
            <li>フリーコース（クラスに属さない別枠）：{r.enrollFree}名</li>
            <li>入金済みの月謝：{r.paid.count}件・¥{r.paid.total.toLocaleString()}</li>
            {!r.dryRun && <li>作成したレッスンの回：{r.lessons}回</li>}
          </ul>
          {r.classesCreated.length > 0 && (
            <details><summary className="cursor-pointer text-brand-700">作成する12月までのクラス（{r.classesCreated.length}）</summary><ul className="mt-1 list-disc pl-5">{r.classesCreated.map((c) => <li key={c}>{c}</li>)}</ul></details>
          )}
          {r.issues.length > 0 && (
            <div>
              <p className="font-semibold text-amber-800">確認が必要なこと（{r.issues.length}件）</p>
              <table className="table mt-1"><tbody>{r.issues.map((x, i) => <tr key={i}><td className="whitespace-nowrap">{x.name}</td><td className="!whitespace-normal">{x.message}</td></tr>)}</tbody></table>
            </div>
          )}
          {r.dryRun && <p className="text-slate-600">内容がよければ「確認だけ」のチェックを外して、もう一度「取り込む」を押してください。</p>}
        </div>
      )}
    </div>
  );
}
