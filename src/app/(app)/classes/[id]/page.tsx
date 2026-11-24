import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { canManage, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, fmtWeekday, fmtTime, jstDateKey } from "@/lib/format";
import { WEEKDAYS, enrollmentCovers, gradeLabel, todayKey } from "@/lib/school";
import { ClassForm } from "../ClassForm";
import { GenerateForm } from "../GenerateForm";
import { endEnrollment, enroll } from "../actions";

export const metadata = { title: "クラス詳細" };

export default async function ClassPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; past?: string }> }) {
  const me = await requireStaff();
  const { id } = await params;
  const { q, past } = await searchParams;
  const now = new Date();
  const c = await db.schoolClass.findUnique({
    where: { id },
    include: {
      level: true,
      court: true,
      plan: true,
      coach: { select: { name: true } },
      enrollments: { include: { member: true }, orderBy: { startDate: "asc" } },
      slots: {
        where: past ? { startsAt: { lte: now } } : { startsAt: { gt: now } },
        orderBy: { startsAt: past ? "desc" : "asc" },
        take: 12,
        include: { reservations: { select: { kind: true, status: true } } },
      },
    },
  });
  if (!c) notFound();
  const [levels, courts, coaches, plans] = await Promise.all([
    db.level.findMany({ where: { OR: [{ active: true }, { id: c.levelId ?? "" }] }, orderBy: { rank: "asc" } }),
    db.court.findMany({ orderBy: { sortOrder: "asc" } }),
    db.staff.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.plan.findMany({ where: { kind: "MONTHLY" }, orderBy: { sortOrder: "asc" } }),
  ]);
  const current = c.enrollments.filter((e) => enrollmentCovers(e, now) || e.startDate > now);
  const ended = c.enrollments.filter((e) => !current.includes(e));
  const enrolledIds = new Set(current.map((e) => e.memberId));
  const candidates = q
    ? await db.member.findMany({
        where: {
          status: "ACTIVE",
          OR: [
            { lastName: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } },
            { lastKana: { contains: q } }, { firstKana: { contains: q } }, { phone: { contains: q } },
            ...(Number.isInteger(Number(q)) ? [{ memberNo: Number(q) }] : []),
          ],
        },
        take: 10,
      })
    : [];
  const manage = canManage(me.role);
  const today = todayKey();

  return (
    <>
      <PageHeader title={c.name} back="/classes" />
      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
        <span className="font-semibold">{c.target === "JUNIOR" ? "ジュニア" : "一般"}</span>
        <span>毎週{WEEKDAYS[c.weekday]}曜日 {c.startTime}〜（{c.durationMin}分）</span>
        <span>{c.court.name}</span>
        {c.level && <span>レベル {c.level.name}</span>}
        <span>コーチ {c.coach?.name ?? "未定"}</span>
        <span>月謝 {c.plan ? `${c.plan.name} ¥${c.plan.price.toLocaleString()}` : "未設定"}</span>
        <span>在籍 {current.length}/{c.capacity}名</span>
        {!c.active && <Badge>停止中</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card overflow-x-auto">
            <h2 className="border-b px-4 py-3 font-semibold">在籍者</h2>
            {current.length === 0 ? <Empty>在籍者はいません</Empty> : (
              <table className="table">
                <thead><tr><th>会員</th><th>在籍期間</th><th>在籍の終了（退会・クラス変更）</th></tr></thead>
                <tbody>
                  {current.map((e) => (
                    <tr key={e.id}>
                      <td><Link className="text-brand-700 hover:underline" href={`/members/${e.memberId}`}>{e.member.lastName} {e.member.firstName}</Link>{gradeLabel(e.member.birthDate) && <span className="ml-1 text-xs text-slate-500">{gradeLabel(e.member.birthDate)}</span>}{e.member.medicalNote && <span className="ml-1 cursor-help" title={e.member.medicalNote}><Badge tone="yellow">配慮あり</Badge></span>}{e.member.status !== "ACTIVE" && <span className="ml-1"><Badge tone="yellow">休会</Badge></span>}</td>
                      <td className="whitespace-nowrap">{fmtDate(e.startDate)}〜{e.endDate ? fmtDate(e.endDate) : ""}{e.startDate > now && <span className="ml-1"><Badge tone="blue">開始前</Badge></span>}</td>
                      <td>
                        <ActionForm action={endEnrollment} className="flex items-center gap-2" confirm="この日を最終回として在籍を終了しますか？以降の出席予定は消えます">
                          <input type="hidden" name="id" value={e.id} />
                          <input className="input w-40" type="date" name="endDate" defaultValue={e.endDate ? jstDateKey(e.endDate) : today} />
                          <Submit className="btn-secondary btn-sm">終了日に設定</Submit>
                        </ActionForm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {ended.length > 0 && (
              <details className="border-t px-4 py-3 text-sm">
                <summary className="cursor-pointer text-slate-500">過去の在籍（{ended.length}名）</summary>
                <ul className="mt-2 space-y-1">
                  {ended.map((e) => <li key={e.id}><Link className="text-brand-700 hover:underline" href={`/members/${e.memberId}`}>{e.member.lastName} {e.member.firstName}</Link> <span className="text-slate-500">{fmtDate(e.startDate)}〜{fmtDate(e.endDate)}</span></li>)}
                </ul>
              </details>
            )}
          </div>

          <div className="card overflow-x-auto">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="font-semibold">{past ? "これまでの回" : "これからの回"}</h2>
              <Link className="text-sm text-brand-700 hover:underline" href={past ? `/classes/${c.id}` : `/classes/${c.id}?past=1`}>{past ? "これからの回へ" : "これまでの回へ"}</Link>
            </div>
            {c.slots.length === 0 ? <Empty>{past ? "まだ実施した回はありません" : "作成済みの回がありません。右の「回を作成」から作ってください"}</Empty> : (
              <table className="table">
                <thead><tr><th>日時</th><th>出席予定</th><th>欠席連絡</th><th>振替参加</th><th>空き</th><th></th></tr></thead>
                <tbody>
                  {c.slots.map((s) => {
                    const act = s.reservations.filter((r) => r.status === "RESERVED" || r.status === "ATTENDED");
                    const absent = s.reservations.filter((r) => r.kind === "REGULAR" && r.status === "CANCELED").length;
                    const makeup = act.filter((r) => r.kind === "MAKEUP").length;
                    return (
                      <tr key={s.id} className={s.status === "CANCELED" ? "opacity-60" : ""}>
                        <td className="whitespace-nowrap">{fmtWeekday(s.startsAt)} {fmtTime(s.startsAt)}{s.status === "CANCELED" && <span className="ml-2"><Badge tone="red">休講</Badge></span>}</td>
                        <td>{act.length - makeup}名</td>
                        <td>{absent ? `${absent}名` : "-"}</td>
                        <td>{makeup ? `${makeup}名` : "-"}</td>
                        <td>{s.status === "OPEN" ? `${Math.max(0, s.capacity - act.length)}席` : "-"}</td>
                        <td><Link className="text-brand-700 hover:underline" href={`/schedule/${s.id}`}>出欠</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="mb-3 font-semibold">在籍を追加</h2>
            <form className="flex gap-2">
              <input className="input" name="q" defaultValue={q} placeholder="氏名・カナ・電話・会員番号" />
              <button className="btn-secondary">検索</button>
            </form>
            {q && (
              <ul className="mt-3 divide-y">
                {candidates.length === 0 && <li className="py-2 text-sm text-slate-500">該当する会員がいません</li>}
                {candidates.map((m) => (
                  <li key={m.id} className="py-3">
                    <p className="text-sm font-medium">{m.lastName} {m.firstName}<span className="ml-2 text-xs text-slate-500">No.{String(m.memberNo).padStart(6, "0")}</span></p>
                    {enrolledIds.has(m.id) ? <p className="mt-1 text-xs text-slate-500">在籍中です</p> : (
                      <ActionForm action={enroll} className="mt-2 flex items-center gap-2">
                        <input type="hidden" name="classId" value={c.id} />
                        <input type="hidden" name="memberId" value={m.id} />
                        <input className="input" type="date" name="startDate" defaultValue={today} aria-label="在籍開始日" />
                        <Submit className="btn-primary btn-sm">在籍登録</Submit>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {manage && <div className="card p-5"><h2 className="mb-3 font-semibold">回を作成</h2><GenerateForm classId={c.id} /></div>}
          {manage && <div className="card p-5"><h2 className="mb-3 font-semibold">クラスの設定</h2><ClassForm c={c} levels={levels} courts={courts} coaches={coaches} plans={plans} /></div>}
        </div>
      </div>
    </>
  );
}
