import { BRAND } from "@/lib/brand";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/member-auth";
import { PAY_METHOD, fmtDate, yen } from "@/lib/format";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "領収書" };

export default async function Receipt({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ name?: string }> }) {
  const me = await requireMember();
  const { id } = await params;
  const { name } = await searchParams;
  const [p, s] = await Promise.all([db.payment.findFirst({ where: { id, memberId: me.id } }), db.setting.findUnique({ where: { id: 1 } })]);
  if (!p || p.amount <= 0) notFound();
  const to = (name ?? `${me.lastName} ${me.firstName}`).slice(0, 40);
  const issuer = s?.legalSeller || s?.facilityName || BRAND;
  const no = p.id.slice(-10).toUpperCase();
  const tax = Math.floor((p.amount * 10) / 110);

  return (
    <div className="space-y-6 pt-2 print:pt-0">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1 print:hidden">
        <Link href="/my/history" className="text-xs text-[#1A2420]/55 hover:text-[#1A2420]">← エントリー履歴へ</Link>
        <form className="flex items-end gap-2 text-xs">
          <label className="text-[#1A2420]/60">宛名<input name="name" defaultValue={to} className="ml-2 border-0 border-b border-[#1A2420]/25 bg-transparent px-0 py-1 text-sm focus:border-[#0B6B4F] focus:outline-none focus:ring-0" /></label>
          <button className="rounded-lg border border-[#1A2420]/20 px-3 py-1.5">変更</button>
        </form>
      </div>

      {p.refundedAt ? (
        <p className="border-l-2 border-[#C2410C] bg-white px-4 py-3 text-sm">このお支払いは返金済みのため、領収書は発行できません。</p>
      ) : (
        <article className="rounded-2xl bg-white px-8 py-10 text-[#1A2420] print:rounded-none print:px-0">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-3xl font-medium tracking-[0.4em]">領収書</h1>
            <dl className="text-right text-xs leading-relaxed text-[#1A2420]/70">
              <div>No. {no}</div>
              <div>発行日 {fmtDate(new Date())}</div>
            </dl>
          </div>
          <p className="mt-8 border-b border-[#1A2420]/40 pb-1 text-lg">{to}　様</p>
          <div className="mt-8 flex items-baseline justify-between border-y-2 border-[#1A2420] px-2 py-4">
            <span className="text-sm">金額</span>
            <span className="font-display text-4xl font-medium tracking-wide">{yen(p.amount)}<span className="ml-1 text-base">（税込）</span></span>
          </div>
          <dl className="mt-6 space-y-2 text-sm">
            <div className="flex gap-4"><dt className="w-24 shrink-0 text-[#1A2420]/60">但し</dt><dd>{(p.description ?? "参加費").replace(/・オンライン決済$/, "")}として</dd></div>
            <div className="flex gap-4"><dt className="w-24 shrink-0 text-[#1A2420]/60">お支払日</dt><dd>{fmtDate(p.paidAt)}</dd></div>
            <div className="flex gap-4"><dt className="w-24 shrink-0 text-[#1A2420]/60">お支払方法</dt><dd>{p.method === "CARD" && p.stripePaymentIntentId ? "クレジットカード（オンライン決済）" : PAY_METHOD[p.method]}</dd></div>
            <div className="flex gap-4"><dt className="w-24 shrink-0 text-[#1A2420]/60">内消費税</dt><dd>{yen(tax)}（10%対象）</dd></div>
          </dl>
          <p className="mt-6 text-sm">上記正に領収いたしました。</p>
          <div className="mt-10 text-right text-sm leading-relaxed">
            <p className="font-medium">{issuer}</p>
            {s?.legalAddress && <p className="text-[#1A2420]/70">{s.legalAddress}</p>}
            {s?.legalPhone && <p className="text-[#1A2420]/70">TEL {s.legalPhone}</p>}
          </div>
        </article>
      )}
      {!p.refundedAt && (
        <div className="px-1 print:hidden">
          <PrintButton />
          <p className="mt-2 text-xs text-[#1A2420]/45">印刷画面で「PDFに保存」を選ぶと、PDFとして保存できます。</p>
        </div>
      )}
    </div>
  );
}
