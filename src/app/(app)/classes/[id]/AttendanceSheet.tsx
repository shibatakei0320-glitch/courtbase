import Link from "next/link";
import { db } from "@/lib/db";
import { fromJst, jstDateKey } from "@/lib/format";
import { coolOf } from "@/lib/school";

/** クラスのクール出欠表（会員×回）。○出席 ×欠席 休＝欠席連絡 ・予定 */
export async function AttendanceSheet({ classId, coolMonths, at }: { classId: string; coolMonths: number; at: Date }) {
  const cool = coolOf(at, coolMonths);
  const from = cool ? fromJst(cool.start) : new Date(at.getTime() - 45 * 86400_000);
  const to = cool ? fromJst(cool.next) : new Date(at.getTime() + 45 * 86400_000);
  const slots = await db.slot.findMany({
    where: { classId, startsAt: { gte: from, lt: to } },
    include: { reservations: { include: { member: true } } },
    orderBy: { startsAt: "asc" },
  });
  if (!slots.length) return <p className="px-4 py-6 text-sm text-slate-500">この期間の回がありません</p>;
  const members = new Map<string, { id: string; name: string; kana: string }>();
  for (const s of slots) for (const r of s.reservations) if (r.status !== "CANCELED" || r.kind === "REGULAR") members.set(r.memberId, { id: r.memberId, name: `${r.member.lastName} ${r.member.firstName}`, kana: r.member.lastKana ?? "" });
  const rows = [...members.values()].sort((a, b) => a.kana.localeCompare(b.kana, "ja"));
  const cell = (s: (typeof slots)[number], memberId: string) => {
    const r = s.reservations.find((x) => x.memberId === memberId && (x.status !== "CANCELED" || x.kind === "REGULAR"));
    if (!r) return { t: "", c: "" };
    const tag = r.kind === "MAKEUP" ? "振" : r.kind === "FREE" ? "F" : "";
    if (r.status === "ATTENDED") return { t: tag || "○", c: "text-emerald-700 font-bold" };
    if (r.status === "NO_SHOW") return { t: "×", c: "text-red-700 font-bold" };
    if (r.status === "CANCELED") return { t: "休", c: "text-slate-400" };
    return { t: tag ? `(${tag})` : "・", c: "text-slate-400" };
  };
  const now = new Date();
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-center text-sm">
        <thead>
          <tr className="bg-slate-50 text-xs text-slate-500">
            <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left">会員</th>
            {slots.map((s) => (
              <th key={s.id} className={`px-1.5 py-2 font-medium ${s.status === "CANCELED" ? "text-red-500" : ""}`}>
                <Link className="hover:underline" href={`/schedule/${s.id}`}>{jstDateKey(s.startsAt).slice(5).replace("-", "/")}</Link>
                {s.status === "CANCELED" && <span className="block">休講</span>}
              </th>
            ))}
            <th className="px-3 py-2">出席</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((m) => {
            const past = slots.filter((s) => s.startsAt <= now && s.status === "OPEN" && s.reservations.some((r) => r.memberId === m.id));
            const att = past.filter((s) => s.reservations.some((r) => r.memberId === m.id && r.status === "ATTENDED")).length;
            return (
              <tr key={m.id}>
                <td className="sticky left-0 whitespace-nowrap bg-white px-3 py-1.5 text-left"><Link className="text-brand-700 hover:underline" href={`/members/${m.id}`}>{m.name}</Link></td>
                {slots.map((s) => {
                  const x = cell(s, m.id);
                  return <td key={s.id} className={`px-1.5 py-1.5 ${x.c} ${s.status === "CANCELED" ? "bg-slate-50" : ""}`}>{x.t}</td>;
                })}
                <td className="whitespace-nowrap px-3 py-1.5 text-xs text-slate-600">{past.length ? `${att}/${past.length}` : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-4 py-2 text-xs text-slate-500">○出席　×欠席（連絡なし）　休＝欠席連絡（振替付与）　振＝振替で参加　F＝フリーで参加　・予定{cool ? `　期間：${cool.label}` : ""}</p>
    </div>
  );
}
