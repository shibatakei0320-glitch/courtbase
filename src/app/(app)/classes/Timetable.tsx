import Link from "next/link";
import { WEEKDAYS } from "@/lib/school";

type C = { id: string; name: string; weekday: number; startTime: string; durationMin: number; target: "ADULT" | "JUNIOR"; course: string; active: boolean; capacity: number; level: { name: string; rank: number } | null; enrolled: number };

/** クラスの色：エンジョイ＝オレンジ、アカデミー＝段階が上がるほど濃い青（48Kの時間割と同じ） */
export function classColor(c: { course: string; level: { rank: number } | null }) {
  if (c.course !== "ACADEMY") return "bg-orange-300 text-orange-950 border-orange-400";
  const r = c.level?.rank ?? 1;
  return r <= 1 ? "bg-blue-100 text-blue-950 border-blue-300" : r === 2 ? "bg-blue-300 text-blue-950 border-blue-400" : r === 3 ? "bg-blue-600 text-white border-blue-700" : "bg-blue-950 text-white border-blue-950";
}

const endTime = (t: string, min: number) => {
  const [h, m] = t.split(":").map(Number);
  const e = h * 60 + m + min;
  return `${Math.floor(e / 60)}:${String(e % 60).padStart(2, "0")}`;
};

/** 週の時間割（曜日×開始時刻） */
export function Timetable({ classes }: { classes: C[] }) {
  const days = [...new Set(classes.map((c) => c.weekday))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const times = [...new Set(classes.map((c) => c.startTime))].sort();
  return (
    <div className="card overflow-x-auto p-3">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `4.5rem repeat(${days.length}, minmax(8.5rem, 1fr))` }}>
        <div />
        {days.map((d) => <div key={d} className="rounded-md bg-yellow-300 py-1.5 text-center font-bold text-slate-900">{WEEKDAYS[d]}</div>)}
        {times.map((t) => (
          <div key={t} className="contents">
            <div className="flex items-center justify-center rounded-md bg-yellow-100 text-xs font-bold text-slate-700">{t}</div>
            {days.map((d) => {
              const cs = classes.filter((c) => c.weekday === d && c.startTime === t);
              return (
                <div key={d} className={`flex min-h-[4.25rem] gap-1 ${cs.length > 1 ? "flex-col" : ""}`}>
                  {cs.length === 0 ? <div className="flex-1 rounded-md bg-slate-50" /> : cs.map((c) => (
                    <Link key={c.id} href={`/classes/${c.id}`} className={`flex flex-1 flex-col justify-between rounded-md border-2 px-2 py-1.5 text-xs hover:brightness-95 ${classColor(c)} ${c.active ? "" : "opacity-40"}`}>
                      <span className="flex items-center justify-between gap-1">
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${c.target === "JUNIOR" ? "bg-emerald-700 text-white" : "bg-slate-800 text-white"}`}>{c.target === "JUNIOR" ? "ジュニア" : "成人"}</span>
                        <span className="opacity-80">{t}–{endTime(t, c.durationMin)}</span>
                      </span>
                      <span className="mt-1 block text-sm font-bold leading-tight">{c.course === "ACADEMY" ? "アカデミー" : c.level ? c.level.name : /幼児|小学生/.exec(c.name)?.[0] ?? "エンジョイ"}</span>
                      {c.course === "ACADEMY" && c.level && <span className="block text-[11px] font-bold leading-tight">{c.level.name}</span>}
                      <span className={`mt-1 block text-right text-[11px] ${c.enrolled >= c.capacity ? "font-bold" : "opacity-80"}`}>在籍 {c.enrolled}/{c.capacity}</span>
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-slate-600">
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-orange-300 align-middle" />エンジョイ</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-blue-100 align-middle" />スタンダード</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-blue-300 align-middle" />アドバンス</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-blue-600 align-middle" />プレーヤー</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-blue-950 align-middle" />トーナメント</span>
      </p>
    </div>
  );
}
