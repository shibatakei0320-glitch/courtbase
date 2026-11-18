import type { Member, Plan } from "@prisma/client";
import { ActionForm, Submit } from "@/components/ActionForm";
import { MEMBER_STATUS, jstDateKey } from "@/lib/format";
import type { ActionState } from "@/lib/action";

export function MemberForm({ action, member, plans }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; member?: Member; plans: Plan[] }) {
  const m = member;
  return (
    <ActionForm action={action} className="grid gap-4 sm:grid-cols-2">
      {m && <input type="hidden" name="id" value={m.id} />}
      <label className="block"><span className="label">姓 *</span><input className="input" name="lastName" defaultValue={m?.lastName} required /></label>
      <label className="block"><span className="label">名 *</span><input className="input" name="firstName" defaultValue={m?.firstName} required /></label>
      <label className="block"><span className="label">セイ</span><input className="input" name="lastKana" defaultValue={m?.lastKana ?? ""} /></label>
      <label className="block"><span className="label">メイ</span><input className="input" name="firstKana" defaultValue={m?.firstKana ?? ""} /></label>
      <label className="block"><span className="label">メールアドレス</span><input className="input" type="email" name="email" defaultValue={m?.email ?? ""} /></label>
      <label className="block"><span className="label">電話番号</span><input className="input" type="tel" name="phone" defaultValue={m?.phone ?? ""} /></label>
      <label className="block"><span className="label">生年月日</span><input className="input" type="date" name="birthDate" defaultValue={m?.birthDate ? jstDateKey(m.birthDate) : ""} /></label>
      <label className="block"><span className="label">性別</span>
        <select className="input" name="gender" defaultValue={m?.gender ?? ""}>
          <option value="">未回答</option><option value="male">男性</option><option value="female">女性</option><option value="other">その他</option>
        </select>
      </label>
      <label className="block"><span className="label">契約プラン</span>
        <select className="input" name="planId" defaultValue={m?.planId ?? ""}>
          <option value="">なし</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? "" : "（停止中）"}</option>)}
        </select>
      </label>
      <label className="block"><span className="label">ステータス</span>
        <select className="input" name="status" defaultValue={m?.status ?? "ACTIVE"}>
          {Object.entries(MEMBER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="block sm:col-span-2"><span className="label">メモ</span><textarea className="input" name="note" rows={3} defaultValue={m?.note ?? ""} /></label>
      <div className="sm:col-span-2"><Submit>{m ? "更新する" : "登録する"}</Submit></div>
    </ActionForm>
  );
}
