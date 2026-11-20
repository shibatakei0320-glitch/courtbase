import Link from "next/link";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/member-auth";
import { ActionForm, Submit } from "@/components/ActionForm";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { LEVEL_RULE, WEEKDAYS, absenceDeadline, enrollmentCovers, schoolSettings } from "@/lib/school";
import { reportAbsence, undoMyAbsence } from "../actions";
import { Notice, hm, jst } from "../ui";

export const metadata = { title: "スクール" };

export default async function SchoolPage({ searchParams }: { searchParams: Promise<{ booked?: string; makeupCanceled?: string }> }) {
  const me = await requireMember();
  const sp = await searchParams;
  const now = new Date();
  const until = new Date(now.getTime() + 35 * 86400_000);
  const [settings, enrollments, lessons, credits] = await Promise.all([
    schoolSettings(),
    db.enrollment.findMany({ where: { memberId: me.id }, include: { schoolClass: { include: { level: true, court: true, coach: { select: { name: true } } } } }, orderBy: { startDate: "asc" } }),
    db.reservation.findMany({
      where: { memberId: me.id, kind: { in: ["REGULAR", "MAKEUP"] }, slot: { startsAt: { gt: new Date(now.getTime() - 3 * 3600_000), lte: until } } },
      include: { slot: { include: { court: true } } },
      orderBy: { slot: { startsAt: "asc" } },
    }),
    db.makeupCredit.findMany({ where: { memberId: me.id, status: "AVAILABLE", expiresAt: { gt: now } }, orderBy: { expiresAt: "asc" } }),
  ]);
  const current = enrollments.filter((e) => enrollmentCovers(e, now) || e.startDate > now);
  // 振替予約中の回の行も、キャンセル済みの振替は出さない
  const rows = lessons.filter((r) => !(r.kind === "MAKEUP" && r.status === "CANCELED"));
  const usedSources = new Set(
    (await db.makeupCredit.findMany({ where: { memberId: me.id, sourceReservationId: { in: rows.map((r) => r.id) }, status: "USED" }, select: { sourceReservationId: true } })).map((c) => c.sourceReservationId),
  );

  return (
    <div className="space-y-10">
      <Link href="/my" className="inline-block px-1 text-xs text-[#13201A]/55 hover:text-[#13201A]">← マイページ</Link>

      <section className="rounded-2xl bg-[#0F3D2E] px-6 pb-7 pt-6 text-white">
        <p className="text-xs text-white/60">使える振替</p>
        <p className="mt-2 font-display text-[4rem] font-medium leading-[0.85]">{credits.length}<span className="ml-1 text-lg">回</span></p>
        {credits.length > 0 ? (
          <>
            <p className="mt-3 text-sm text-white/70">いちばん早い期限：{fmtDate(credits[0].expiresAt)}</p>
            <Link href="/my/school/makeup" className="mt-5 inline-block rounded-xl bg-[#E4F25C] px-5 py-3 text-sm font-bold text-[#0F3D2E] hover:bg-[#d8e64f]">振替の回を選ぶ</Link>
          </>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-white/70">レッスンを欠席連絡すると、振替が1回分付きます。</p>
        )}
      </section>

      {sp.booked && <Notice>振替の予約が完了しました。</Notice>}
      {sp.makeupCanceled && <Notice>振替の予約を取り消しました。振替の権利は戻っています。</Notice>}

      <section>
        <h2 className="mb-2 px-1 text-sm font-bold">在籍クラス</h2>
        {current.length === 0 ? (
          <p className="border-y border-[#13201A]/10 px-1 py-6 text-sm text-[#13201A]/55">在籍しているクラスはありません。</p>
        ) : (
          <ul className="divide-y divide-[#13201A]/10 border-y border-[#13201A]/10">
            {current.map((e) => (
              <li key={e.id} className="px-1 py-4">
                <p className="font-medium">{e.schoolClass.name}</p>
                <p className="mt-1 text-xs text-[#13201A]/55">
                  毎週{WEEKDAYS[e.schoolClass.weekday]}曜日 {e.schoolClass.startTime}〜（{e.schoolClass.durationMin}分）　{e.schoolClass.court.name}
                  {e.schoolClass.level && `　${e.schoolClass.level.name}`}{e.schoolClass.coach && `　コーチ ${e.schoolClass.coach.name}`}
                </p>
                {e.endDate && <p className="mt-1 text-xs text-[#B4371F]">{fmtDate(e.endDate)}の回まで</p>}
                {e.startDate > now && <p className="mt-1 text-xs text-[#0F3D2E]">{fmtDate(e.startDate)}から</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 px-1 text-sm font-bold">これからのレッスン</h2>
        <p className="mb-3 px-1 text-xs leading-relaxed text-[#13201A]/55">
          お休みするときは{settings.absenceDeadlineHours > 0 ? `開始の${settings.absenceDeadlineHours}時間前` : "開始時刻"}までに「欠席連絡」をしてください。振替は欠席した日から{settings.makeupValidDays}日以内、{LEVEL_RULE[settings.levelRule]}のクラスに使えます。
        </p>
        {rows.length === 0 ? (
          <p className="border-y border-[#13201A]/10 px-1 py-6 text-sm text-[#13201A]/55">5週間以内の予定はありません。</p>
        ) : (
          <ul className="divide-y divide-[#13201A]/10 border-y border-[#13201A]/10">
            {rows.map((r) => {
              const d = jst(r.slot.startsAt);
              const canceledLesson = r.slot.status === "CANCELED";
              const started = r.slot.startsAt <= now;
              const absent = r.kind === "REGULAR" && r.status === "CANCELED";
              const canAbsent = r.kind === "REGULAR" && r.status === "RESERVED" && !canceledLesson && now <= absenceDeadline(r.slot.startsAt, settings.absenceDeadlineHours);
              return (
                <li key={r.id} className="flex gap-5 px-1 py-4">
                  <span className="w-14 shrink-0">
                    <span className="block font-display text-[1.7rem] font-medium leading-none text-[#0F3D2E]">{d.m}.{String(d.d).padStart(2, "0")}</span>
                    <span className="mt-1 block text-xs text-[#13201A]/55">{d.w}曜日</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-snug">{r.slot.title}{r.kind === "MAKEUP" && <span className="ml-2 rounded bg-[#E4F25C] px-1.5 py-0.5 text-[11px] font-bold text-[#0F3D2E]">振替</span>}</span>
                    <span className="mt-0.5 block text-xs text-[#13201A]/55">{hm(r.slot.startsAt)}–{hm(r.slot.endsAt)}　{r.slot.court.name}</span>
                    <span className="mt-2 block text-xs">
                      {canceledLesson ? <span className="font-bold text-[#B4371F]">休講（振替が付きました）</span>
                        : absent ? <span className="text-[#13201A]/60">欠席連絡済み</span>
                        : r.status === "ATTENDED" ? <span className="text-[#0F3D2E]">出席</span>
                        : r.status === "NO_SHOW" ? <span className="text-[#B4371F]">欠席</span>
                        : started ? <span className="text-[#13201A]/60">レッスン中</span>
                        : <span className="font-bold text-[#0F3D2E]">出席予定</span>}
                    </span>
                    {canAbsent && (
                      <ActionForm action={reportAbsence} confirm={`${d.m}/${d.d}(${d.w}) のレッスンを欠席しますか？`} className="mt-3">
                        <input type="hidden" name="id" value={r.id} />
                        <Submit className="rounded-lg border border-[#B4371F]/40 px-4 py-2 text-xs font-bold text-[#B4371F] hover:bg-[#B4371F]/5 disabled:opacity-60">欠席連絡する</Submit>
                      </ActionForm>
                    )}
                    {absent && !canceledLesson && !started && !usedSources.has(r.id) && (
                      <ActionForm action={undoMyAbsence} confirm="欠席連絡を取り消して、出席に戻しますか？（付いた振替はなくなります）" className="mt-3">
                        <input type="hidden" name="id" value={r.id} />
                        <Submit className="text-xs text-[#13201A]/55 underline underline-offset-4 hover:text-[#13201A]">やっぱり出席する</Submit>
                      </ActionForm>
                    )}
                    {r.kind === "MAKEUP" && r.status === "RESERVED" && !started && (
                      <Link href={`/my/events/${r.slotId}`} className="mt-3 inline-block text-xs text-[#13201A]/55 underline underline-offset-4 hover:text-[#13201A]">振替の取り消し</Link>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {credits.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-sm font-bold">振替の内訳</h2>
          <ul className="divide-y divide-[#13201A]/10 border-y border-[#13201A]/10 text-sm">
            {credits.map((c) => (
              <li key={c.id} className="flex justify-between gap-4 px-1 py-3">
                <span>{c.reason}</span>
                <span className="text-[#13201A]/60">{fmtDateTime(c.expiresAt).slice(0, 10)}まで</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
