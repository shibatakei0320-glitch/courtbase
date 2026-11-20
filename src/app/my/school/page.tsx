import Link from "next/link";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/member-auth";
import { ActionForm, Submit } from "@/components/ActionForm";
import { fmtDate, jstDateKey, yen } from "@/lib/format";
import { familyMember, familyOf } from "@/lib/family";
import { LEVEL_RULE, TARGET_LABEL, WEEKDAYS, absenceDeadline, enrollmentCovers, gradeLabel, schoolSettings } from "@/lib/school";
import { cancelMyReservation, reportAbsence, undoMyAbsence } from "../actions";
import { Chip, FamilyTabs, Notice, hm, mdw, ui } from "../ui";

export const metadata = { title: "レッスン予定" };

export default async function SchoolPage({ searchParams }: { searchParams: Promise<{ m?: string; booked?: string; makeupCanceled?: string }> }) {
  const me = await requireMember();
  const sp = await searchParams;
  const fam = await familyOf(me);
  // 指定がなければ、在籍のある最初の人
  const firstEnrolled = (await db.enrollment.findFirst({ where: { memberId: { in: fam.map((f) => f.id) } }, orderBy: { startDate: "asc" } }))?.memberId;
  const who = (await familyMember(me, sp.m ?? firstEnrolled)) ?? me;
  const now = new Date();
  const until = new Date(now.getTime() + 35 * 86400_000);
  const [settings, enrollments, lessons, credits, invoices, leaves] = await Promise.all([
    schoolSettings(),
    db.enrollment.findMany({ where: { memberId: who.id }, include: { schoolClass: { include: { level: true, court: true, coach: { select: { name: true } } } } }, orderBy: { startDate: "asc" } }),
    db.reservation.findMany({
      where: { memberId: who.id, kind: { in: ["REGULAR", "MAKEUP"] }, slot: { startsAt: { gt: new Date(now.getTime() - 3 * 3600_000), lte: until } } },
      include: { slot: { include: { court: true } } },
      orderBy: { slot: { startsAt: "asc" } },
    }),
    db.makeupCredit.findMany({ where: { memberId: who.id, status: "AVAILABLE", expiresAt: { gt: now } }, orderBy: { expiresAt: "asc" } }),
    db.invoice.findMany({ where: { memberId: who.id, status: { not: "VOID" } }, orderBy: { month: "desc" }, take: 3 }),
    db.leave.findMany({ where: { memberId: who.id, toMonth: { gte: jstDateKey(now).slice(0, 7) } }, orderBy: { fromMonth: "asc" } }),
  ]);
  const current = enrollments.filter((e) => enrollmentCovers(e, now) || e.startDate > now);
  const rows = lessons.filter((r) => !(r.kind === "MAKEUP" && r.status === "CANCELED"));
  const usedSources = new Set(
    (await db.makeupCredit.findMany({ where: { sourceReservationId: { in: rows.map((r) => r.id) }, status: "USED" }, select: { sourceReservationId: true } })).map((c) => c.sourceReservationId),
  );
  const tabs = fam.map((f) => ({ id: f.id, firstName: f.firstName, grade: gradeLabel(f.birthDate) }));
  const name = fam.length > 1 ? `${who.firstName}さんの` : "";

  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <Link href="/my" className={`px-1 text-sm ${ui.link}`}>← マイページ</Link>
        <h1 className="px-1 text-2xl font-bold">{name}レッスン予定</h1>
        <FamilyTabs fam={tabs} current={who.id} base="/my/school" />
      </div>

      {sp.booked && <Notice>振替の予約が完了しました。</Notice>}
      {sp.makeupCanceled && <Notice>振替の予約を取り消しました。振替の権利は戻っています。</Notice>}

      <section className={`${ui.card} flex items-center justify-between gap-4`}>
        <div>
          <p className="text-sm text-[#5B6661]">使える振替</p>
          <p className="text-3xl font-bold">{credits.length}<span className="ml-1 text-base font-normal">回</span></p>
          {credits[0] && <p className="text-sm text-[#5B6661]">いちばん早い期限 {fmtDate(credits[0].expiresAt)}</p>}
        </div>
        <Link href={`/my/school/makeup?m=${who.id}`} className={`${credits.length ? ui.primary : ui.secondary} !w-auto`}>振替を予約</Link>
      </section>

      <section>
        <h2 className={ui.h2}>これからのレッスン</h2>
        <p className="mb-3 px-1 text-sm leading-relaxed text-[#5B6661]">
          お休みするときは、{settings.absenceDeadlineHours > 0 ? `開始の${settings.absenceDeadlineHours}時間前` : "開始時刻"}までに「お休みする」を押してください。振替が1回分付きます（{settings.makeupValidDays}日以内・{LEVEL_RULE[settings.levelRule]}のクラス）。
        </p>
        {rows.length === 0 ? (
          <p className={`${ui.card} text-base text-[#5B6661]`}>5週間以内の予定はありません。</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const canceledLesson = r.slot.status === "CANCELED";
              const started = r.slot.startsAt <= now;
              const absent = r.kind === "REGULAR" && r.status === "CANCELED";
              const canAbsent = r.kind === "REGULAR" && r.status === "RESERVED" && !canceledLesson && now <= absenceDeadline(r.slot.startsAt, settings.absenceDeadlineHours);
              const makeupCancelable = r.kind === "MAKEUP" && r.status === "RESERVED" && !started && now.getTime() <= r.slot.startsAt.getTime() - settings.cancelDeadlineHours * 3600_000;
              return (
                <li key={r.id} className={ui.card}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold">{mdw(r.slot.startsAt)}</p>
                      <p className="text-base">{hm(r.slot.startsAt)}〜{hm(r.slot.endsAt)}</p>
                      <p className="mt-0.5 text-sm text-[#5B6661]">{r.slot.title}・{r.slot.court.name}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {canceledLesson ? <Chip tone="warn">休講</Chip>
                        : absent ? <Chip tone="off">お休み</Chip>
                        : r.status === "ATTENDED" ? <Chip tone="ok">出席</Chip>
                        : r.status === "NO_SHOW" ? <Chip tone="warn">欠席</Chip>
                        : r.kind === "MAKEUP" ? <Chip tone="info">振替で参加</Chip>
                        : <Chip tone="ok">出席予定</Chip>}
                    </div>
                  </div>
                  {canceledLesson && <p className="mt-2 text-sm text-[#C2410C]">休講のため、振替が1回分付いています。</p>}
                  {canAbsent && (
                    <ActionForm action={reportAbsence} confirm={`${name}${mdw(r.slot.startsAt)} ${hm(r.slot.startsAt)} のレッスンをお休みしますか？\n（振替が1回分付きます）`} className="mt-4">
                      <input type="hidden" name="id" value={r.id} />
                      <Submit className={ui.danger}>お休みする</Submit>
                    </ActionForm>
                  )}
                  {absent && !canceledLesson && !started && !usedSources.has(r.id) && (
                    <ActionForm action={undoMyAbsence} confirm="お休みを取り消して、出席に戻しますか？（付いた振替はなくなります）" className="mt-3">
                      <input type="hidden" name="id" value={r.id} />
                      <Submit className={`text-sm ${ui.link}`}>やっぱり出席する</Submit>
                    </ActionForm>
                  )}
                  {makeupCancelable && (
                    <ActionForm action={cancelMyReservation} confirm="この振替を取り消しますか？（振替は戻ります）" className="mt-3">
                      <input type="hidden" name="id" value={r.id} />
                      <Submit className={`text-sm ${ui.link}`}>振替を取り消す</Submit>
                    </ActionForm>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className={ui.h2}>在籍クラス</h2>
        {current.length === 0 ? (
          <p className={`${ui.card} text-base text-[#5B6661]`}>在籍しているクラスはありません。お申し込みはスクールにご連絡ください。</p>
        ) : (
          <ul className="space-y-3">
            {current.map((e) => (
              <li key={e.id} className={ui.card}>
                <p className="text-base font-bold">{e.schoolClass.name}{e.schoolClass.target === "JUNIOR" && <span className="ml-2 align-middle"><Chip tone="info">{TARGET_LABEL.JUNIOR}</Chip></span>}</p>
                <p className="mt-1 text-sm text-[#5B6661]">
                  毎週{WEEKDAYS[e.schoolClass.weekday]}曜日 {e.schoolClass.startTime}〜（{e.schoolClass.durationMin}分）・{e.schoolClass.court.name}
                  {e.schoolClass.level && `・${e.schoolClass.level.name}`}{e.schoolClass.coach && `・コーチ ${e.schoolClass.coach.name}`}
                </p>
                {e.endDate && <p className="mt-1 text-sm text-[#C2410C]">{fmtDate(e.endDate)}のレッスンまで</p>}
                {e.startDate > now && <p className="mt-1 text-sm text-[#0B6B4F]">{fmtDate(e.startDate)}から</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {(invoices.length > 0 || leaves.length > 0) && (
        <section id="tuition">
          <h2 className={ui.h2}>月謝</h2>
          <div className={ui.card}>
            {leaves.map((l) => <p key={l.id} className="mb-2 text-sm text-[#C2410C]">{l.fromMonth.replace("-", "年")}月〜{l.toMonth.replace("-", "年")}月は休会です</p>)}
            <ul className="divide-y divide-[#1A2420]/10">
              {invoices.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-4 py-3">
                  <span className="text-base">{Number(i.month.slice(5))}月分</span>
                  <span className="flex items-center gap-3">
                    <span className="text-lg font-bold">{yen(i.amount)}</span>
                    {i.status === "PAID" ? <Chip tone="ok">お支払い済み</Chip> : <Chip tone="warn">未払い</Chip>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {credits.length > 0 && (
        <section>
          <h2 className={ui.h2}>振替の内訳</h2>
          <ul className={`${ui.card} divide-y divide-[#1A2420]/10 !py-1`}>
            {credits.map((c) => (
              <li key={c.id} className="flex justify-between gap-4 py-3 text-base">
                <span>{c.reason}</span>
                <span className="text-[#5B6661]">{fmtDate(c.expiresAt)}まで</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
