import Link from "next/link";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, fmtTime, fromJst, jstDateKey } from "@/lib/format";
import { WEEKDAYS, gradeLabel } from "@/lib/school";
import { classColor } from "../classes/Timetable";
import { mark, markAll } from "./actions";

export const metadata = { title: "出欠" };
const KIND = { REGULAR: "", MAKEUP: "振替", FREE: "フリー", NORMAL: "単発" } as const;

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string; coach?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : jstDateKey(new Date());
  const [slots, coaches] = await Promise.all([
    db.slot.findMany({
      where: { classId: { not: null }, startsAt: { gte: fromJst(date), lt: fromJst(addDays(date, 1)) }, ...(sp.coach ? { instructorId: sp.coach } : {}) },
      include: {
        court: true,
        instructor: { select: { name: true } },
        schoolClass: { include: { level: true } },
        reservations: { include: { member: true }, orderBy: [{ kind: "asc" }, { member: { lastKana: "asc" } }] },
      },
      orderBy: { startsAt: "asc" },
    }),
    db.staff.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const wd = WEEKDAYS[new Date(fromJst(date).getTime() + 9 * 3600_000).getUTCDay()];
  const q = (d: string) => `/attendance?date=${d}${sp.coach ? `&coach=${sp.coach}` : ""}`;

  return (
    <>
      <PageHeader
        title="出欠"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link className="btn-secondary btn-sm" href={q(addDays(date, -1))}>←</Link>
            <form className="flex gap-2">
              <input className="input py-1.5" type="date" name="date" defaultValue={date} />
              <select className="input py-1.5" name="coach" defaultValue={sp.coach ?? ""}><option value="">全コーチ</option>{coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <button className="btn-secondary btn-sm">表示</button>
            </form>
            <Link className="btn-secondary btn-sm" href={q(addDays(date, 1))}>→</Link>
          </div>
        }
      />
      <p className="mb-4 text-lg font-bold">{Number(date.slice(5, 7))}月{Number(date.slice(8))}日（{wd}）のレッスン</p>
      {slots.length === 0 ? <div className="card"><Empty>この日のレッスンはありません</Empty></div> : (
        <div className="grid gap-4 xl:grid-cols-2">
          {slots.map((s) => {
            const c = s.schoolClass!;
            const coming = s.reservations.filter((r) => r.status !== "CANCELED");
            const absent = s.reservations.filter((r) => r.status === "CANCELED" && r.kind === "REGULAR");
            const attended = coming.filter((r) => r.status === "ATTENDED").length;
            return (
              <section key={s.id} className={`card overflow-hidden ${s.status === "CANCELED" ? "opacity-60" : ""}`}>
                <div className={`flex flex-wrap items-center justify-between gap-2 border-b-2 px-4 py-2 ${classColor(c)}`}>
                  <span className="font-bold">{fmtTime(s.startsAt)}–{fmtTime(s.endsAt)}　{c.target === "JUNIOR" ? "ジュニア" : "成人"} {c.course === "ACADEMY" ? `アカデミー ${c.level?.name ?? ""}` : "エンジョイ"}</span>
                  <span className="text-xs">{s.court.name}{s.instructor ? `・${s.instructor.name}` : ""}</span>
                </div>
                {s.status === "CANCELED" ? <p className="px-4 py-3 text-sm text-red-700">休講</p> : (
                  <>
                    <div className="flex items-center justify-between px-4 py-2 text-sm">
                      <span>出席 <b>{attended}</b>／予定 {coming.length}名{absent.length > 0 && `・欠席連絡 ${absent.length}名`}</span>
                      <span className="flex gap-2">
                        {coming.some((r) => r.status === "RESERVED") && (
                          <ActionForm action={markAll}><input type="hidden" name="slotId" value={s.id} /><Submit className="btn-primary btn-sm">全員出席</Submit></ActionForm>
                        )}
                        <Link className="btn-secondary btn-sm" href={`/schedule/${s.id}`}>詳細</Link>
                      </span>
                    </div>
                    <ul className="divide-y">
                      {coming.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-2">
                          <span className="min-w-0">
                            <Link className="font-medium hover:underline" href={`/members/${r.memberId}`}>{r.member.lastName} {r.member.firstName}</Link>
                            <span className="ml-1 text-xs text-slate-500">{gradeLabel(r.member.birthDate) ?? ""}</span>
                            {KIND[r.kind] && <span className="ml-1"><Badge tone="yellow">{KIND[r.kind]}</Badge></span>}
                            {r.member.medicalNote && <span className="ml-1 cursor-help" title={r.member.medicalNote}><Badge tone="red">配慮</Badge></span>}
                          </span>
                          <span className="flex shrink-0 gap-1">
                            <Btn id={r.id} status="ATTENDED" label="出席" on={r.status === "ATTENDED"} tone="green" />
                            <Btn id={r.id} status="NO_SHOW" label="欠席" on={r.status === "NO_SHOW"} tone="red" />
                            {r.status !== "RESERVED" && <Btn id={r.id} status="RESERVED" label="戻す" />}
                          </span>
                        </li>
                      ))}
                      {absent.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-2 bg-slate-50 px-4 py-2 text-sm text-slate-500">
                          <span>{r.member.lastName} {r.member.firstName}</span><span>欠席連絡あり（振替付与）</span>
                        </li>
                      ))}
                      {coming.length === 0 && absent.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">参加者はいません</li>}
                    </ul>
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function Btn({ id, status, label, on, tone }: { id: string; status: string; label: string; on?: boolean; tone?: "green" | "red" }) {
  const active = on ? (tone === "green" ? "bg-emerald-600 text-white border-emerald-600" : "bg-red-600 text-white border-red-600") : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50";
  return (
    <ActionForm action={mark}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Submit className={`rounded-md border px-3 py-1.5 text-sm font-medium ${active}`}>{label}</Submit>
    </ActionForm>
  );
}
