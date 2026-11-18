// 会員ページ用の部品

const TZ = "Asia/Tokyo";
const WD = ["日", "月", "火", "水", "木", "金", "土"];

export function jst(d: Date) {
  const j = new Date(d.getTime() + 9 * 3600_000);
  return { m: j.getUTCMonth() + 1, d: j.getUTCDate(), w: WD[j.getUTCDay()] };
}
export const hm = (d: Date) => d.toLocaleTimeString("ja-JP", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

/** 細い線で描いたピックルボールのコート（右寄せ・装飾） */
export function Court({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 440" aria-hidden className={`pointer-events-none absolute ${className}`}>
      <g fill="none" stroke="white" strokeOpacity="0.22" strokeWidth="1">
        <rect x="10" y="10" width="200" height="420" />
        <line x1="10" y1="152" x2="210" y2="152" />
        <line x1="10" y1="288" x2="210" y2="288" />
        <line x1="110" y1="10" x2="110" y2="152" />
        <line x1="110" y1="288" x2="110" y2="430" />
      </g>
      <line x1="2" y1="220" x2="218" y2="220" stroke="#E4F25C" strokeOpacity="0.9" strokeWidth="1.5" />
    </svg>
  );
}

/** 定員の埋まり具合（細いバー） */
export function Fill({ taken, capacity, dark = false }: { taken: number; capacity: number; dark?: boolean }) {
  const pct = capacity > 0 ? Math.min(100, (taken / capacity) * 100) : 100;
  return (
    <span className={`block h-[2px] w-full ${dark ? "bg-white/15" : "bg-[#13201A]/10"}`} aria-hidden>
      <span className={`block h-full ${dark ? "bg-[#E4F25C]" : "bg-[#0F3D2E]"}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return <div role="status" className="border-l-2 border-[#0F3D2E] bg-white px-4 py-3 text-sm leading-relaxed">{children}</div>;
}
