import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { lineWebhookConfigured } from "@/lib/line-message";
import { appUrl } from "@/lib/url";
import { AutoRefresh } from "./AutoRefresh";
import { ContactList, FILTERS, type Filter } from "./ContactList";

export const metadata = { title: "LINE受信箱" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const f: Filter = sp.f && sp.f in FILTERS ? (sp.f as Filter) : "open";
  return (
    <>
      <PageHeader title="LINE受信箱" />
      <AutoRefresh />
      {!lineWebhookConfigured() && <Setup />}
      <div className="grid gap-6 lg:grid-cols-3">
        <ContactList f={f} q={sp.q} />
        <div className="card hidden p-8 text-sm leading-relaxed text-slate-500 lg:col-span-2 lg:block">
          <p className="font-semibold text-slate-700">左の一覧から会話を選んでください。</p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>会員がトーク画面のボタン（欠席連絡・振替予約・予定確認）で手続きしたものは自動で処理され、ここに履歴だけが残ります。</li>
            <li>自由に書かれたメッセージは「要対応」になります。返信すると対応済みになります。</li>
            <li>予約確定・欠席受付・休講などのお知らせも、送った内容がすべて会話に残ります。</li>
          </ul>
        </div>
      </div>
    </>
  );
}

function Setup() {
  return (
    <div className="card mb-6 border-amber-300 bg-amber-50 p-5 text-sm leading-relaxed text-amber-900">
      <p className="font-semibold">LINE公式アカウントとの連携が未設定です</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>LINE Developers で公式アカウントの Messaging API チャネルを開き、チャネルアクセストークン（長期）を <code>LINE_MESSAGING_TOKEN</code>、チャネルシークレットを <code>LINE_MESSAGING_SECRET</code> に設定</li>
        <li>Webhook URL に <code className="break-all">{appUrl()}/api/line/webhook</code> を設定し、「Webhookの利用」をオン</li>
        <li>LINE Official Account Manager のリッチメニューで、ボタンのアクションを「テキスト」にし「欠席連絡」「振替予約」「予定確認」「メニュー」を送るように設定</li>
        <li>会員ログイン用の LINE ログインチャネルは、公式アカウントと同じプロバイダーに作成（同じ人のLINEユーザーIDが一致するため）</li>
      </ol>
    </div>
  );
}
