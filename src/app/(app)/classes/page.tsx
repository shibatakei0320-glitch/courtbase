import Link from "next/link";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { canManage, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { WEEKDAYS, enrollmentCovers } from "@/lib/school";
import { ClassForm } from "./ClassForm";
import { GenerateForm } from "./GenerateForm";
import { Timetable } from "./Timetable";
import { ActionForm, Submit } from "@/components/ActionForm";
import { applyTemplate } from "./actions";

export const metadata = { title: "クラス" };

export default async function ClassesPage() {
  const me = await requireStaff();
  const now = new Date();
  const [classes, levels, courts, coaches, plans] = await Promise.all([
    db.schoolClass.findMany({
      include: {
        level: true,
        court: true,
        plan: true,
        coach: { select: { name: true } },
        enrollments: { where: { member: { status: "ACTIVE" } }, select: { startDate: true, endDate: true } },
        slots: { where: { startsAt: { gt: now }, status: "OPEN" }, orderBy: { startsAt: "desc" }, take: 1, select: { startsAt: true } },
      },
      orderBy: [{ active: "desc" }, { weekday: "asc" }, { startTime: "asc" }],
    }),
    db.level.findMany({ where: { active: true }, orderBy: { rank: "asc" } }),
    db.court.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.staff.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.plan.findMany({ where: { kind: "MONTHLY" }, orderBy: { sortOrder: "asc" } }),
  ]);
  const manage = canManage(me.role);
  const byDay = WEEKDAYS.map((w, i) => ({ w, i, list: classes.filter((c) => c.weekday === i) })).filter((d) => d.list.length);
  // 月曜はじまりで並べる
  byDay.sort((a, b) => ((a.i + 6) % 7) - ((b.i + 6) % 7));

  return (
    <>
      <PageHeader title="クラス（定期レッスン）" actions={<Link href="/makeups" className="btn-secondary">振替の管理</Link>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {classes.length > 0 && <Timetable classes={classes.map((c) => ({ ...c, enrolled: c.enrollments.filter((e) => enrollmentCovers(e, now) || e.startDate > now).length }))} />}
          {classes.length === 0 && manage && (
            <div className="card border-brand-500 p-5">
              <h2 className="font-semibold">48K萩校の時間割・料金をまとめて登録</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">ホームページのコース・料金とクラススケジュール（火・水・金・土の23クラス）、アカデミーの段階（スタンダード／アドバンス／プレーヤー／トーナメント）、受講プラン（月4回・月8回・フリー）、振替のルール（登録クラスか1つ下・期限なし）、クール制を登録します。あとから自由に変更できます。</p>
              <ActionForm action={applyTemplate} className="mt-3" confirm="48K萩校の時間割・料金を登録しますか？">
                <Submit>まとめて登録</Submit>
              </ActionForm>
            </div>
          )}
          {classes.length === 0 ? <div className="card"><Empty>クラスがありません。右のフォームから作成してください</Empty></div> : <details><summary className="cursor-pointer px-1 text-sm text-brand-700">曜日ごとの一覧で見る</summary><div className="mt-3 space-y-6">{byDay.map((d) => (
            <div key={d.i} className="card overflow-x-auto">
              <h2 className="border-b px-4 py-3 font-semibold">{d.w}曜日</h2>
              <table className="table">
                <thead><tr><th>時間</th><th>クラス</th><th>レベル</th><th>コート</th><th>コーチ</th><th>月謝</th><th>在籍</th><th>回の作成</th></tr></thead>
                <tbody>
                  {d.list.map((c) => {
                    const n = c.enrollments.filter((e) => enrollmentCovers(e, now) || e.startDate > now).length;
                    return (
                      <tr key={c.id} className={c.active ? "" : "opacity-50"}>
                        <td className="whitespace-nowrap">{c.startTime}〜（{c.durationMin}分）</td>
                        <td className="!whitespace-normal">{c.target === "JUNIOR" && <span className="mb-0.5 block w-fit rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">ジュニア</span>}<Link href={`/classes/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.name}</Link>{!c.active && <span className="ml-2"><Badge>停止</Badge></span>}</td>
                        <td>{c.level ? <span className="whitespace-nowrap"><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: c.level.color }} />{c.level.name}</span> : "-"}</td>
                        <td>{c.court.name}</td>
                        <td>{c.coach?.name ?? "-"}</td>
                        <td className="whitespace-nowrap">{c.plan ? `¥${c.plan.price.toLocaleString()}` : <span className="text-amber-700">未設定</span>}</td>
                        <td className="whitespace-nowrap"><span className={n >= c.capacity ? "font-semibold text-red-700" : ""}>{n}/{c.capacity}名</span></td>
                        <td className="whitespace-nowrap text-sm text-slate-500">{c.slots[0] ? `${c.slots[0].startsAt.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" })}まで` : <span className="text-amber-700">なし</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}</div></details>}
        </div>
        {manage && (
          <div className="space-y-6">
            <div className="card p-5"><h2 className="mb-3 font-semibold">回をまとめて作成</h2><GenerateForm /></div>
            <div className="card p-5">
              <h2 className="mb-3 font-semibold">新しいクラス</h2>
              {courts.length === 0 ? <p className="text-sm text-slate-500">先に<Link className="text-brand-700 underline" href="/master/courts">コート</Link>を登録してください</p> : <ClassForm levels={levels} courts={courts} coaches={coaches} plans={plans} />}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
