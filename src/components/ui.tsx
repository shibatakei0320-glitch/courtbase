import Link from "next/link";

export function PageHeader({ title, actions, back }: { title: string; actions?: React.ReactNode; back?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        {back && <Link href={back} className="text-sm text-slate-500 hover:text-slate-700">← 戻る</Link>}
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const TONES = {
  green: "bg-emerald-100 text-emerald-800",
  gray: "bg-slate-100 text-slate-700",
  red: "bg-red-100 text-red-800",
  yellow: "bg-amber-100 text-amber-800",
  blue: "bg-blue-100 text-blue-800",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`badge ${TONES[tone]}`}>{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-slate-500">{children}</div>;
}

export function Pager({ page, total, perPage, base }: { page: number; total: number; perPage: number; base: string }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;
  const href = (p: number) => `${base}${base.includes("?") ? "&" : "?"}page=${p}`;
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
      <span className="text-slate-500">{total}件中 {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)}件</span>
      <div className="flex gap-2">
        {page > 1 && <Link className="btn-secondary btn-sm" href={href(page - 1)}>前へ</Link>}
        {page < pages && <Link className="btn-secondary btn-sm" href={href(page + 1)}>次へ</Link>}
      </div>
    </div>
  );
}
