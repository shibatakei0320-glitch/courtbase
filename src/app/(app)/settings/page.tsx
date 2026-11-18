import { ActionForm, Submit } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveSettings } from "./actions";

export const metadata = { title: "施設設定" };

export default async function SettingsPage() {
  await requireStaff(["OWNER"]);
  const s = (await db.setting.findUnique({ where: { id: 1 } })) ?? { facilityName: "pickleland", openHour: 7, closeHour: 23, cancelDeadlineHours: 24, sessionHours: 12, contactEmail: null };
  return (
    <>
      <PageHeader title="施設設定" />
      <div className="card max-w-2xl p-6">
        <ActionForm action={saveSettings} className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className="label">施設名</span><input className="input" name="facilityName" defaultValue={s.facilityName} /></label>
          <label className="block"><span className="label">営業開始(時)</span><input className="input" type="number" name="openHour" min={0} max={23} defaultValue={s.openHour} /></label>
          <label className="block"><span className="label">営業終了(時)</span><input className="input" type="number" name="closeHour" min={1} max={24} defaultValue={s.closeHour} /></label>
          <input type="hidden" name="cancelDeadlineHours" value={s.cancelDeadlineHours} />
          <label className="block"><span className="label">ログイン有効時間（時間）</span><input className="input" type="number" name="sessionHours" min={1} max={720} defaultValue={s.sessionHours} /></label>
          <label className="block sm:col-span-2"><span className="label">問い合わせ先メール</span><input className="input" type="email" name="contactEmail" defaultValue={s.contactEmail ?? ""} /></label>
          <div className="sm:col-span-2"><Submit>保存</Submit></div>
        </ActionForm>
      </div>
    </>
  );
}
