// 会員ページ用のビジュアル部品（ピックルボールのコート・ボール）

const TZ = "Asia/Tokyo";
const WD = ["日", "月", "火", "水", "木", "金", "土"];

/** JSTの月・日・曜日 */
export function jst(d: Date) {
  const j = new Date(d.getTime() + 9 * 3600_000);
  return { m: j.getUTCMonth() + 1, d: j.getUTCDate(), w: WD[j.getUTCDay()], sat: j.getUTCDay() === 6, sun: j.getUTCDay() === 0 };
}
export const hm = (d: Date) => d.toLocaleTimeString("ja-JP", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

/** 上から見たピックルボールのコート（サイドライン・ネット・キッチンライン・センターライン） */
export function CourtLines({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 440 200" preserveAspectRatio="xMidYMid slice" aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}>
      <g fill="none" stroke="white" strokeOpacity="0.28" strokeWidth="2">
        <rect x="20" y="20" width="400" height="160" />
        <line x1="156" y1="20" x2="156" y2="180" />
        <line x1="284" y1="20" x2="284" y2="180" />
        <line x1="20" y1="100" x2="156" y2="100" />
        <line x1="284" y1="100" x2="420" y2="100" />
      </g>
      <rect x="156" y="20" width="128" height="160" fill="white" fillOpacity="0.05" />
      <line x1="220" y1="12" x2="220" y2="188" stroke="white" strokeOpacity="0.55" strokeWidth="3" strokeDasharray="2 4" />
    </svg>
  );
}

/** 穴あきのピックルボール */
export function Ball({ size = 56, className = "" }: { size?: number; className?: string }) {
  const holes = [
    [50, 22], [30, 34], [70, 34], [50, 50], [24, 58], [76, 58], [38, 74], [62, 74], [50, 88],
  ];
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className={className}>
      <circle cx="50" cy="50" r="48" fill="#D9F24A" />
      <circle cx="50" cy="50" r="48" fill="url(#shade)" />
      <defs>
        <radialGradient id="shade" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="white" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#6b7a10" stopOpacity="0.35" />
        </radialGradient>
      </defs>
      {holes.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="5.5" fill="#8C9A1E" fillOpacity="0.7" />)}
    </svg>
  );
}

/** 定員を小さなボールの列で表示（塗り=埋まっている枠） */
export function Spots({ taken, capacity }: { taken: number; capacity: number }) {
  const left = Math.max(0, capacity - taken);
  if (capacity > 24) {
    return (
      <span className="flex items-center gap-2" aria-label={`残り${left}名`}>
        <span className="h-2 w-24 overflow-hidden rounded-full bg-[#111C3A]/10">
          <span className="block h-full rounded-full bg-[#1E47B8]" style={{ width: `${Math.min(100, (taken / capacity) * 100)}%` }} />
        </span>
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-[3px]" aria-label={`定員${capacity}名・残り${left}名`}>
      {Array.from({ length: capacity }, (_, i) => (
        <span key={i} className={`h-2 w-2 rounded-full ${i < taken ? "bg-[#1E47B8]" : "bg-[#D9F24A] ring-1 ring-inset ring-[#8C9A1E]/50"}`} />
      ))}
    </span>
  );
}

export function Notice({ tone = "ok", children }: { tone?: "ok" | "info"; children: React.ReactNode }) {
  return (
    <div role="status" className={`rounded-2xl px-4 py-3 text-sm font-medium ${tone === "ok" ? "bg-[#D9F24A] text-[#111C3A]" : "bg-white text-[#111C3A]/80"}`}>
      {children}
    </div>
  );
}
