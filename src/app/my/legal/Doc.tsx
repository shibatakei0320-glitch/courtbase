import Link from "next/link";

export function LegalDoc({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="space-y-6 pt-2">
      <Link href="/my" className="inline-block px-1 text-xs text-[#1A2420]/55 hover:text-[#1A2420]">← マイページへ</Link>
      <h1 className="px-1 text-2xl font-medium tracking-wide">{title}</h1>
      <div className="rounded-2xl bg-white px-6 py-7 text-sm leading-[1.95] text-[#1A2420]/85">{children}</div>
    </article>
  );
}
