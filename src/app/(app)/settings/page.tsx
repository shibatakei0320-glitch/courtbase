import { BRAND, SCHOOL } from "@/lib/brand";
import { ActionForm, Submit } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveSettings } from "./actions";
import { defaultPrivacy, defaultTerms } from "@/lib/legal";
import { LEVEL_RULE } from "@/lib/school";

export const metadata = { title: "施設設定" };

export default async function SettingsPage() {
  await requireStaff(["OWNER"]);
  const found = await db.setting.findUnique({ where: { id: 1 } });
  const s = found ?? { facilityName: BRAND, openHour: 7, closeHour: 23, cancelDeadlineHours: 24, sessionHours: 12, contactEmail: null, facilityMode: false, absenceDeadlineHours: 0, makeupValidDays: 60, makeupLevelRule: "SAME_OR_LOWER", admissionFee: 0, leaveFee: 0, prorateMidMonth: true, legalSeller: null, legalManager: null, legalAddress: null, legalPhone: null, legalEmail: null, legalNotes: null, termsText: null, privacyText: null };
  return (
    <>
      <PageHeader title="施設設定" />
      <div className="card max-w-2xl p-6">
        <ActionForm action={saveSettings} className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
            <input type="checkbox" name="facilityMode" defaultChecked={s.facilityMode} className="mt-1 h-4 w-4" />
            <span>
              <span className="block text-sm font-semibold">施設の予約・入退場（QR）を使う</span>
              <span className="mt-1 block text-xs text-slate-500">オンにすると、会員ページに「コートを予約」「会員証（QRコード）」が、管理画面に「入退場（QR）」が表示されます。施設がない間はオフにしておくと、会員ページは大会・イベントなどの申込みだけになります。</span>
            </span>
          </label>
          <label className="block sm:col-span-2"><span className="label">施設名</span><input className="input" name="facilityName" defaultValue={s.facilityName} /></label>
          <label className="block"><span className="label">営業開始(時)</span><input className="input" type="number" name="openHour" min={0} max={23} defaultValue={s.openHour} /></label>
          <label className="block"><span className="label">営業終了(時)</span><input className="input" type="number" name="closeHour" min={1} max={24} defaultValue={s.closeHour} /></label>
          <label className="block"><span className="label">会員のキャンセル期限（開始の何時間前まで）</span><input className="input" type="number" name="cancelDeadlineHours" min={0} max={720} defaultValue={s.cancelDeadlineHours} /><span className="mt-1 block text-xs text-slate-500">期限内なら会員がマイページからキャンセルでき、カード払いは全額返金されます</span></label>
          <label className="block"><span className="label">ログイン有効時間（時間）</span><input className="input" type="number" name="sessionHours" min={1} max={720} defaultValue={s.sessionHours} /></label>
          <label className="block sm:col-span-2"><span className="label">問い合わせ先メール</span><input className="input" type="email" name="contactEmail" defaultValue={s.contactEmail ?? ""} /></label>
          {SCHOOL && (
            <>
          <div className="mt-4 border-t pt-6 sm:col-span-2">
            <h2 className="font-semibold">スクール（欠席・振替）</h2>
            <p className="mt-1 text-xs text-slate-500">クラス在籍者が会員ページから欠席連絡すると、振替の権利が1回分付きます。権利を使って、空きのある別の回を予約できます。</p>
          </div>
          <label className="block"><span className="label">欠席連絡の期限（開始の何時間前まで）</span><input className="input" type="number" name="absenceDeadlineHours" min={0} max={168} defaultValue={s.absenceDeadlineHours} /><span className="mt-1 block text-xs text-slate-500">0 なら開始時刻まで。期限後の欠席は振替なし（スタッフは期限後も受付可）</span></label>
          <label className="block"><span className="label">振替の有効期限（欠席した日から何日）</span><input className="input" type="number" name="makeupValidDays" min={1} max={365} defaultValue={s.makeupValidDays} /></label>
          <label className="block sm:col-span-2"><span className="label">振替できるレベル</span>
            <select className="input" name="makeupLevelRule" defaultValue={s.makeupLevelRule}>
              {Object.entries(LEVEL_RULE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <div className="mt-4 border-t pt-6 sm:col-span-2">
            <h2 className="font-semibold">月謝</h2>
            <p className="mt-1 text-xs text-slate-500">クラスごとの月謝は、クラスの設定で月額プランを選びます。</p>
          </div>
          <label className="block"><span className="label">入会金（円）</span><input className="input" type="number" min={0} name="admissionFee" defaultValue={s.admissionFee} /><span className="mt-1 block text-xs text-slate-500">初めての月謝に加算。0なら請求しません</span></label>
          <label className="block"><span className="label">休会費（円／月）</span><input className="input" type="number" min={0} name="leaveFee" defaultValue={s.leaveFee} /></label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="prorateMidMonth" defaultChecked={s.prorateMidMonth} />月の途中の入会・退会・クラス変更は、その月のレッスン回数で按分する（オフなら満額）</label>
            </>
          )}
          <div className="mt-4 border-t pt-6 sm:col-span-2">
            <h2 className="font-semibold">特定商取引法に基づく表記</h2>
            <p className="mt-1 text-xs text-slate-500">カード決済の本番利用に必要です。空欄の項目は「請求があった場合には遅滞なく開示いたします」と表示されます（個人事業の場合に認められている書き方です）。<a className="text-brand-700 underline" href="/my/legal/tokushoho" target="_blank">表示を確認</a></p>
          </div>
          <label className="block"><span className="label">販売事業者（屋号・法人名）</span><input className="input" name="legalSeller" defaultValue={s.legalSeller ?? ""} placeholder={s.facilityName} /></label>
          <label className="block"><span className="label">運営責任者</span><input className="input" name="legalManager" defaultValue={s.legalManager ?? ""} /></label>
          <label className="block sm:col-span-2"><span className="label">所在地</span><input className="input" name="legalAddress" defaultValue={s.legalAddress ?? ""} /></label>
          <label className="block"><span className="label">電話番号</span><input className="input" name="legalPhone" defaultValue={s.legalPhone ?? ""} /></label>
          <label className="block"><span className="label">メールアドレス</span><input className="input" type="email" name="legalEmail" defaultValue={s.legalEmail ?? ""} /></label>
          <label className="block sm:col-span-2"><span className="label">キャンセル・返金の条件</span><textarea className="input" name="legalNotes" rows={3} defaultValue={s.legalNotes ?? ""} placeholder="空欄なら既定の文面（キャンセル期限までは全額返金、施設都合の中止も全額返金）" /></label>
          <div className="mt-4 border-t pt-6 sm:col-span-2">
            <h2 className="font-semibold">利用規約・プライバシーポリシー</h2>
            <p className="mt-1 text-xs text-slate-500">ひな形の文面が入っています。施設の運用に合わせて書き換えてください（専門家の確認をおすすめします）。<a className="text-brand-700 underline" href="/my/legal/terms" target="_blank">利用規約</a>・<a className="text-brand-700 underline" href="/my/legal/privacy" target="_blank">プライバシーポリシー</a></p>
          </div>
          <label className="block sm:col-span-2"><span className="label">利用規約</span><textarea className="input font-mono text-xs" name="termsText" rows={10} defaultValue={s.termsText ?? defaultTerms(s.facilityName, s.cancelDeadlineHours)} /></label>
          <label className="block sm:col-span-2"><span className="label">プライバシーポリシー</span><textarea className="input font-mono text-xs" name="privacyText" rows={10} defaultValue={s.privacyText ?? defaultPrivacy(s.facilityName)} /></label>
          <div className="sm:col-span-2"><Submit>保存</Submit></div>
        </ActionForm>
      </div>
    </>
  );
}
