import type { Member, Plan } from "@prisma/client";
import { ActionForm, Submit } from "@/components/ActionForm";
import { MEMBER_STATUS, jstDateKey } from "@/lib/format";
import type { ActionState } from "@/lib/action";
import { SCHOOL } from "@/lib/brand";

export function MemberForm({ action, member, plans, guardian }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; member?: Member; plans: Plan[]; guardian?: Member | null }) {
  const m = member ?? (guardian ? ({ lastName: guardian.lastName, lastKana: guardian.lastKana, phone: guardian.phone } as Member) : undefined);
  return (
    <ActionForm action={action} className="grid gap-4 sm:grid-cols-2">
      {member && <input type="hidden" name="id" value={member.id} />}
      {guardian && !member && (
        <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-700 sm:col-span-2">
          <input type="hidden" name="guardianId" value={guardian.id} />
          保護者：{guardian.lastName} {guardian.firstName}さんのお子さまとして登録します（お知らせは保護者のLINEに届きます）
        </p>
      )}
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
      {SCHOOL && (
        <>
          <Section title="月謝の払い方" />
          <label className="block"><span className="label">払い方</span>
            <select className="input" name="tuitionMethod" defaultValue={m?.tuitionMethod ?? "CASH"}>
              <option value="DEBIT">口座振替（自動引き落とし）</option><option value="CASH">現金</option><option value="TRANSFER">振込</option><option value="CARD">カード</option>
            </select>
          </label>
          <label className="block"><span className="label">預金者名（カナ）</span><input className="input" name="accountHolder" defaultValue={m?.accountHolder ?? ""} placeholder="ｻﾄｳ ｹﾝﾀ" /></label>
          <label className="block"><span className="label">金融機関（コード・名前）</span><span className="flex gap-2"><input className="input w-24" name="bankCode" inputMode="numeric" defaultValue={m?.bankCode ?? (m ? "" : "0170")} placeholder="0170" /><input className="input" name="bankName" defaultValue={m?.bankName ?? ""} placeholder="ﾔﾏｸﾞﾁ" /></span></label>
          <label className="block"><span className="label">支店（コード・名前）</span><span className="flex gap-2"><input className="input w-24" name="branchCode" inputMode="numeric" defaultValue={m?.branchCode ?? ""} /><input className="input" name="branchName" defaultValue={m?.branchName ?? ""} placeholder="ﾊｷﾞ" /></span></label>
          <label className="block"><span className="label">口座</span><span className="flex gap-2"><select className="input w-28" name="accountType" defaultValue={String(m?.accountType ?? 1)}><option value="1">普通</option><option value="2">当座</option></select><input className="input" name="accountNo" inputMode="numeric" defaultValue={m?.accountNo ?? ""} placeholder="口座番号（7桁）" /></span></label>
          <p className="self-end text-xs text-slate-500">口座振替依頼書の内容を写してください。カナは半角に変換して保存します。</p>
        </>
      )}
      <Section title="大会・協会" />
      <label className="block"><span className="label">登録団体</span><input className="input" name="associationName" defaultValue={m?.associationName ?? ""} placeholder="山口県テニス協会" /></label>
      <label className="block"><span className="label">登録番号</span><input className="input" name="associationNo" defaultValue={m?.associationNo ?? ""} /></label>
      <Section title="緊急連絡先・健康・保険" />
      <label className="block"><span className="label">緊急連絡先（氏名・続柄）</span><span className="flex gap-2"><input className="input" name="emergencyName" defaultValue={m?.emergencyName ?? ""} /><input className="input w-24" name="emergencyRelation" defaultValue={m?.emergencyRelation ?? ""} placeholder="母" /></span></label>
      <label className="block"><span className="label">緊急連絡先（電話）</span><input className="input" type="tel" name="emergencyPhone" defaultValue={m?.emergencyPhone ?? ""} /></label>
      <label className="block sm:col-span-2"><span className="label">配慮すること（持病・アレルギー・けがなど）</span><textarea className="input" name="medicalNote" rows={2} defaultValue={m?.medicalNote ?? ""} /></label>
      <label className="block"><span className="label">スポーツ安全保険の加入年度</span><input className="input" name="insuranceYear" inputMode="numeric" defaultValue={m?.insuranceYear ?? ""} placeholder="2026" /></label>
      <label className="block"><span className="label">学校名（ジュニア）</span><input className="input" name="schoolName" defaultValue={m?.schoolName ?? ""} /></label>
      <label className="block sm:col-span-2"><span className="label">メモ</span><textarea className="input" name="note" rows={3} defaultValue={m?.note ?? ""} /></label>
      <div className="sm:col-span-2"><Submit>{m ? "更新する" : "登録する"}</Submit></div>
    </ActionForm>
  );
}

function Section({ title }: { title: string }) {
  return <h3 className="mt-2 border-t pt-4 text-sm font-semibold text-slate-700 sm:col-span-2">{title}</h3>;
}
