"use client";

/** 定型文を返信欄に入れる */
export function Templates({ items }: { items: string[] }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-brand-700">定型文</summary>
      <ul className="mt-2 space-y-1">
        {items.map((t) => (
          <li key={t}>
            <button
              type="button"
              className="w-full rounded bg-slate-50 px-2 py-1 text-left text-slate-600 hover:bg-slate-100"
              onClick={() => {
                const el = document.getElementById("reply") as HTMLTextAreaElement | null;
                if (el) { el.value = el.value ? `${el.value}\n${t}` : t; el.focus(); }
              }}
            >{t}</button>
          </li>
        ))}
      </ul>
    </details>
  );
}
