import Link from "next/link";
import { db, facilityModeOn } from "@/lib/db";
import { requireMember } from "@/lib/member-auth";
import type { SlotKind } from "@prisma/client";
import { yen } from "@/lib/format";
import { familyOf } from "@/lib/family";
import { absenceDeadline, gradeLabel, schoolSettings } from "@/lib/school";
import { ActionForm, Submit } from "@/components/ActionForm";
import { reportAbsence } from "./actions";
import { Chip, Fill, Notice, hm, jst, mdw, ui } from "./ui";

const KIND_LABEL: Record<SlotKind, string> = { RENTAL: "コート利用", LESSON: "レッスン", EVENT: "大会・イベント" };

export async function SchoolHome({ searchParams }: { searchParams: Promise<{ paid?: string; applied?: string; canceled?: string }> }) {
  const me = await requireMember();
  const sp = await searchParams;
  const now = new Date();
  const [facility, fam, settings] = await Promise.all([facilityModeOn(), familyOf(me), schoolSettings()]);
  const famIds = fam.map((m) => m.id);

  // スクール：家族それぞれの次のレッスンと振替の数
  const people = await Promise.all(
    fam.map(async (m) => {
      const [enrolled, next, credits] = await Promise.all([
        db.enrollment.count({ where: { memberId: m.id, OR: [{ endDate: null }, { endDate: { gte: new Date(now.getTime() - 86400_000) } }] } }),
        db.reservation.findFirst({
          where: { memberId: m.id, kind: { in: ["REGULAR", "MAKEUP"] }, status: "RESERVED", slot: { status: "OPEN", startsAt: { gt: now } } },
          include: { slot: { include: { court: true } } },
          orderBy: { slot: { startsAt: "asc" } },
        }),
        db.makeupCredit.count({ where: { memberId: m.id, status: "AVAILABLE", expiresAt: { gt: now } } }),
      ]);
      return { m, enrolled, next, credits, grade: gradeLabel(m.birthDate) };
    }),
  );
  const school = people.filter((p) => p.enrolled > 0 || p.credits > 0);

  // 大会・イベントなど（クラスの回以外）
  const [mine, events] = await Promise.all([
    db.reservation.findMany({ where: { memberId: { in: famIds }, kind: "NORMAL", status: "RESERVED", slot: { endsAt: { gte: now } } }, select: { slotId: true } }),
    db.slot.findMany({
      where: { status: "OPEN", memberBooked: false, classId: null, startsAt: { gt: now }, ...(facility ? {} : { kind: { not: "RENTAL" } }) },
      include: { _count: { select: { categories: true, reservations: { where: { status: { in: ["RESERVED", "ATTENDED"] } } } } } },
      orderBy: { startsAt: "asc" },
      take: 30,
    }),
  ]);
  const myIds = new Set(mine.map((r) => r.slotId));

  return (
    <div className="space-y-8">
      <p className="px-1 text-xl font-bold">{me.lastName} {me.firstName}さん、こんにちは</p>

      {sp.paid && <Notice>お支払いが完了しました。予約の反映まで数秒かかることがあります。</Notice>}
      {sp.applied && <Notice>予約が完了しました。</Notice>}
      {sp.canceled !== undefined && <Notice>予約をキャンセルしました。{Number(sp.canceled) > 0 ? `${yen(Number(sp.canceled))}を返金しました。` : ""}</Notice>}

      {school.map(({ m, next, credits, grade }) => {
        const canAbsent = next?.kind === "REGULAR" && now <= absenceDeadline(next.slot.startsAt, settings.absenceDeadlineHours);
        return (
          <section key={m.id} className={ui.card}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold">{fam.length > 1 ? `${m.firstName}さん` : "次のレッスン"}{grade && <span className="ml-2 text-sm font-normal text-[#5B6661]">{grade}</span>}</h2>
              {credits > 0 && <Chip tone="info">振替 {credits}回</Chip>}
            </div>
            {next ? (
              <div className="mt-3 rounded-xl bg-[#F4F6F3] px-4 py-3">
                {fam.length > 1 && <p className="text-sm text-[#5B6661]">次のレッスン</p>}
                <p className="text-2xl font-bold tracking-tight">{mdw(next.slot.startsAt)}</p>
                <p className="mt-0.5 text-lg">{hm(next.slot.startsAt)}〜{hm(next.slot.endsAt)}</p>
                <p className="mt-1 text-base text-[#5B6661]">{next.slot.title}・{next.slot.court.name}{next.kind === "MAKEUP" && "（振替）"}</p>
              </div>
            ) : (
              <p className="mt-3 text-base text-[#5B6661]">予定されているレッスンはありません。</p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3">
              {canAbsent && next ? (
                <ActionForm action={reportAbsence} confirm={`${fam.length > 1 ? `${m.firstName}さんの` : ""}${mdw(next.slot.startsAt)} ${hm(next.slot.startsAt)} のレッスンをお休みしますか？\n（振替が1回分付きます）`}>
                  <input type="hidden" name="id" value={next.id} />
                  <Submit className={ui.danger}>お休みする</Submit>
                </ActionForm>
              ) : (
                <Link href={`/my/school?m=${m.id}`} className={ui.secondary}>予定を見る</Link>
              )}
              <Link href={`/my/school/makeup?m=${m.id}`} className={credits > 0 ? ui.primary : ui.secondary}>振替を予約</Link>
            </div>
            <Link href={`/my/school?m=${m.id}`} className={`mt-3 block text-center text-sm ${ui.link}`}>レッスン予定・欠席連絡・月謝を見る</Link>
          </section>
        );
      })}

      <section>
        <h2 className={ui.h2}>メニュー</h2>
        <div className="grid grid-cols-2 gap-3">
          <Tile href="/my/school" title="レッスン予定" sub="欠席連絡・月謝" />
          <Tile href="/my/school/makeup" title="振替予約" sub="空いている回を選ぶ" />
          <Tile href="/my/family" title="家族の登録" sub="お子さまの追加" />
          <Tile href="/my/history" title="履歴・領収書" sub="お申し込みの記録" />
          {facility && <Tile href="/my/court" title="コート予約" sub="時間を選んで予約" />}
          {facility && <Tile href="/my/card" title="会員証" sub="入退場用QRコード" />}
        </div>
      </section>

      <section>
        <h2 className={ui.h2}>大会・イベント・レッスンの申込み</h2>
        {events.length === 0 ? (
          <p className={`${ui.card} text-base text-[#5B6661]`}>いま申し込める大会・イベントはありません。</p>
        ) : (
          <ul className="space-y-3">
            {events.map((s) => {
              const d = jst(s.startsAt);
              const taken = s._count.reservations;
              const left = s.capacity - taken;
              const joined = myIds.has(s.id);
              return (
                <li key={s.id}>
                  <Link href={`/my/events/${s.id}`} className={`${ui.card} flex gap-4 hover:ring-2 hover:ring-[#0B6B4F]/30`}>
                    <span className="w-14 shrink-0 text-center">
                      <span className="block text-sm text-[#5B6661]">{d.m}月</span>
                      <span className="block text-3xl font-bold leading-none">{d.d}</span>
                      <span className="mt-1 block text-sm text-[#5B6661]">{d.w}曜</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold text-[#5B6661]">{KIND_LABEL[s.kind]}</span>
                      <span className="block text-base font-bold leading-snug">{s.title}</span>
                      <span className="mt-1 block text-sm text-[#5B6661]">{hm(s.startsAt)}〜{hm(s.endsAt)}　{s._count.categories ? "参加費は種目ごと" : s.price > 0 ? yen(s.price) : "無料"}</span>
                      <span className="mt-2 flex items-center gap-3">
                        <span className="flex-1"><Fill taken={taken} capacity={s.capacity} /></span>
                        {joined ? <Chip tone="ok">申込済み</Chip> : left <= 0 ? <Chip tone="off">満員</Chip> : s._count.categories ? <Chip tone="info">受付中</Chip> : <span className={`text-sm ${left <= 3 ? "font-bold text-[#C2410C]" : "text-[#5B6661]"}`}>残り{left}名</span>}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="px-1 text-sm leading-relaxed text-[#5B6661]">わからないことは、LINEのトークでスクールにお気軽にお問い合わせください。</p>
    </div>
  );
}

function Tile({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <Link href={href} className={`${ui.card} block p-4 hover:ring-2 hover:ring-[#0B6B4F]/30`}>
      <span className="block text-base font-bold">{title}</span>
      <span className="mt-1 block text-sm text-[#5B6661]">{sub}</span>
    </Link>
  );
}
