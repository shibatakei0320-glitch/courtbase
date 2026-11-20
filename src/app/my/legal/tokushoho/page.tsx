import { BRAND } from "@/lib/brand";
import { db } from "@/lib/db";
import { DISCLOSE_ON_REQUEST, cancelPolicy } from "@/lib/legal";
import { LegalDoc } from "../Doc";

export const metadata = { title: "特定商取引法に基づく表記" };

export default async function Tokushoho() {
  const s = await db.setting.findUnique({ where: { id: 1 } });
  const rows: [string, string][] = [
    ["販売事業者", s?.legalSeller || s?.facilityName || BRAND],
    ["運営責任者", s?.legalManager || DISCLOSE_ON_REQUEST],
    ["所在地", s?.legalAddress || DISCLOSE_ON_REQUEST],
    ["電話番号", s?.legalPhone || DISCLOSE_ON_REQUEST],
    ["メールアドレス", s?.legalEmail || s?.contactEmail || DISCLOSE_ON_REQUEST],
    ["販売価格", "各レッスン・利用枠・大会・イベントの詳細ページに表示する金額（税込）"],
    ["商品代金以外の必要料金", "なし"],
    ["支払方法", "クレジットカード決済"],
    ["支払時期", "お申込み時にお支払いが確定します"],
    ["サービスの提供時期", "お申込みいただいた日時"],
    ["キャンセル・返金", s?.legalNotes || cancelPolicy(s?.cancelDeadlineHours ?? 24)],
  ];
  return (
    <LegalDoc title="特定商取引法に基づく表記">
      <dl className="divide-y divide-[#1A2420]/10">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 py-4 first:pt-0 last:pb-0 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-xs text-[#1A2420]/55 sm:text-sm">{k}</dt>
            <dd className="whitespace-pre-wrap">{v}</dd>
          </div>
        ))}
      </dl>
    </LegalDoc>
  );
}
