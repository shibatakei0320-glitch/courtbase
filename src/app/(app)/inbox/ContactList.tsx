import Link from "next/link";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";

export const FILTERS = { open: "要対応", all: "すべて", unlinked: "会員未連携" } as const;
export type Filter = keyof typeof FILTERS;

export async function ContactList({ f, q, activeId }: { f: Filter; q?: string; activeId?: string }) {
  const linkedIds = (await db.member.findMany({ where: { lineUserId: { not: null } }, select: { lineUserId: true } })).map((m) => m.lineUserId!);
  const qMembers = q
    ? await db.member.findMany({ where: { lineUserId: { not: null }, OR: [{ lastName: { contains: q } }, { firstName: { contains: q } }, { lastKana: { contains: q } }] }, select: { lineUserId: true } })
    : [];
  const contacts = await db.lineContact.findMany({
    where: {
      lastMessageAt: { not: null },
      ...(f === "open" ? { needsReply: true } : f === "unlinked" ? { lineUserId: { notIn: linkedIds } } : {}),
      ...(q ? { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { lineUserId: { in: qMembers.map((m) => m.lineUserId!) } }] } : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });
  const members = await db.member.findMany({ where: { lineUserId: { in: contacts.map((c) => c.lineUserId) } }, select: { lineUserId: true, lastName: true, firstName: true } });
  const byLine = new Map(members.map((m) => [m.lineUserId, m]));
  const base = (k: Filter) => `/inbox?f=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="card overflow-hidden">
      <div className="space-y-2 border-b p-3">
        <nav className="flex gap-1">
          {(Object.keys(FILTERS) as Filter[]).map((k) => (
            <Link key={k} href={base(k)} className={`rounded-full px-3 py-1 text-xs ${k === f ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{FILTERS[k]}</Link>
          ))}
        </nav>
        <form action="/inbox" className="flex gap-2">
          <input type="hidden" name="f" value={f} />
          <input className="input py-1.5 text-sm" name="q" defaultValue={q} placeholder="名前で検索" />
        </form>
      </div>
      {contacts.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate-500">{f === "open" ? "要対応のメッセージはありません" : "メッセージはまだありません"}</p>
      ) : (
        <ul className="max-h-[70vh] divide-y overflow-y-auto">
          {contacts.map((c) => {
            const m = byLine.get(c.lineUserId);
            return (
              <li key={c.id}>
                <Link href={`/inbox/${c.id}?f=${f}`} className={`flex gap-3 px-3 py-3 hover:bg-slate-50 ${c.id === activeId ? "bg-brand-50" : ""}`}>
                  {c.pictureUrl ? <img src={c.pictureUrl} alt="" className="h-9 w-9 shrink-0 rounded-full" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs text-slate-500">LINE</span>}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{m ? `${m.lastName} ${m.firstName}` : c.displayName ?? "（名前不明）"}</span>
                      <span className="shrink-0 text-[11px] text-slate-400">{fmtDateTime(c.lastMessageAt).slice(5)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className="truncate text-xs text-slate-500">{c.lastText}</span>
                      {c.unread > 0 && <span className="ml-auto shrink-0 rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">{c.unread}</span>}
                      {c.unread === 0 && c.needsReply && <span className="ml-auto shrink-0 text-[11px] font-bold text-amber-700">要対応</span>}
                    </span>
                    {!m && <span className="mt-0.5 block text-[11px] text-slate-400">会員未連携{c.displayName ? `・${c.displayName}` : ""}</span>}
                    {!c.followed && <span className="mt-0.5 block text-[11px] text-red-600">ブロック中</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
