// 会員ページ用の部品（シンプル・大きめの文字とボタン・はっきりした色）

const TZ = "Asia/Tokyo";
const WD = ["日", "月", "火", "水", "木", "金", "土"];

export function jst(d: Date) {
  const j = new Date(d.getTime() + 9 * 3600_000);
  return { m: j.getUTCMonth() + 1, d: j.getUTCDate(), w: WD[j.getUTCDay()] };
}
export const hm = (d: Date) => d.toLocaleTimeString("ja-JP", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
export const mdw = (d: Date) => {
  const x = jst(d);
  return `${x.m}月${x.d}日（${x.w}）`;
};

/** ボタン・カードの見た目（どのページでも同じにする） */
export const ui = {
  card: "rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(16,40,30,0.06)]",
  primary:
    "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B6B4F] px-5 py-3.5 text-base font-bold text-white transition hover:bg-[#08553F] active:scale-[0.99] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B6B4F]",
  secondary:
    "inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#0B6B4F] bg-white px-5 py-3 text-base font-bold text-[#0B6B4F] transition hover:bg-[#0B6B4F]/5 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B6B4F]",
  danger:
    "inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#C2410C] bg-white px-5 py-3 text-base font-bold text-[#C2410C] transition hover:bg-[#C2410C]/5 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C]",
  link: "text-[#0B6B4F] underline underline-offset-4 hover:text-[#08553F]",
  muted: "text-[#5B6661]",
  h2: "mb-3 px-1 text-lg font-bold",
};

/** 状態のラベル */
export function Chip({ tone, children }: { tone: "ok" | "warn" | "off" | "info"; children: React.ReactNode }) {
  const c = { ok: "bg-[#E6F4EE] text-[#0B6B4F]", warn: "bg-[#FDECE3] text-[#C2410C]", off: "bg-[#EEF0EE] text-[#5B6661]", info: "bg-[#F3F7C8] text-[#4D5A00]" }[tone];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${c}`}>{children}</span>;
}

/** テニスコートの線（装飾） */
export function Court({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 260" aria-hidden className={`pointer-events-none absolute ${className}`}>
      <g fill="none" stroke="white" strokeOpacity="0.25" strokeWidth="1">
        <rect x="6" y="6" width="108" height="248" />
        <line x1="19.5" y1="6" x2="19.5" y2="254" />
        <line x1="100.5" y1="6" x2="100.5" y2="254" />
        <line x1="19.5" y1="70" x2="100.5" y2="70" />
        <line x1="19.5" y1="190" x2="100.5" y2="190" />
        <line x1="60" y1="70" x2="60" y2="190" />
      </g>
      <line x1="0" y1="130" x2="120" y2="130" stroke="#E3F04B" strokeOpacity="0.9" strokeWidth="1.5" />
    </svg>
  );
}

/** 定員の埋まり具合（細いバー） */
export function Fill({ taken, capacity, dark = false }: { taken: number; capacity: number; dark?: boolean }) {
  const pct = capacity > 0 ? Math.min(100, (taken / capacity) * 100) : 100;
  return (
    <span className={`block h-1.5 w-full overflow-hidden rounded-full ${dark ? "bg-white/15" : "bg-[#1A2420]/10"}`} aria-hidden>
      <span className={`block h-full rounded-full ${dark ? "bg-[#E3F04B]" : "bg-[#0B6B4F]"}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return <div role="status" className="rounded-xl border-l-4 border-[#0B6B4F] bg-white px-4 py-3 text-base leading-relaxed">{children}</div>;
}

/** 名前の切り替え（保護者が子どもの分を見るとき） */
export function FamilyTabs({ fam, current, base }: { fam: { id: string; firstName: string; grade: string | null }[]; current: string; base: string }) {
  if (fam.length < 2) return null;
  return (
    <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="表示する人">
      {fam.map((m) => (
        <a key={m.id} href={`${base}?m=${m.id}`} aria-current={m.id === current ? "page" : undefined}
          className={`shrink-0 rounded-full border-2 px-4 py-2 text-sm font-bold ${m.id === current ? "border-[#0B6B4F] bg-[#0B6B4F] text-white" : "border-[#1A2420]/15 bg-white text-[#1A2420]"}`}>
          {m.firstName}{m.grade && <span className="ml-1 text-xs font-normal opacity-80">{m.grade}</span>}
        </a>
      ))}
    </nav>
  );
}
