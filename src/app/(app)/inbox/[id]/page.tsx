import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, fmtTime, fmtWeekday } from "@/lib/format";
import { availableCredits, gradeLabel, makeupCandidates } from "@/lib/school";
import { AutoRefresh } from "../AutoRefresh";
import { Templates } from "../Templates";
import { ContactList, FILTERS, type Filter } from "../ContactList";
import { linkMember, sendReply, setNeedsReply, staffAbsence, staffMakeup } from "../actions";

export const metadata = { title: "LINE受信箱" };

const TEMPLATES = [
  "お問い合わせありがとうございます。確認してご連絡いたします。",
  "承知しました。欠席で承りました。振替はトーク画面の「振替予約」からお選びいただけます。",
  "振替のご予約を承りました。当日お待ちしております。",
  "申し訳ありません、その回は満員のため、別の回をお選びください。",
];

export default async function ThreadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string; mq?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const f: Filter = sp.f && sp.f in FILTERS ? (sp.f as Filter) : "open";
  const c = await db.lineContact.findUnique({ where: { id } });
  if (!c) notFound();
  if (c.unread > 0) await db.lineContact.update({ where: { id }, data: { unread: 0 } });
  const [messages, member] = await Promise.all([
    db.lineMessage.findMany({ where: { contactId: id }, include: { staff: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.member.findUnique({ where: { lineUserId: c.lineUserId }, include: { children: { where: { status: { not: "WITHDRAWN" } }, orderBy: { birthDate: "asc" } } } }),
  ]);

  return (
    <>
      <AutoRefresh />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/inbox?f=${f}`} className="text-sm text-slate-500 hover:text-slate-700">← 受信箱</Link>
          <h1 className="text-xl font-bold text-slate-900">
            {member ? `${member.lastName} ${member.firstName}` : c.displayName ?? "（名前不明）"}
            {c.displayName && member && <span className="ml-2 text-sm font-normal text-slate-500">LINE：{c.displayName}</span>}
          </h1>
        </div>
        <ActionForm action={setNeedsReply}>
          <input type="hidden" name="contactId" value={c.id} />
          <input type="hidden" name="needs" value={c.needsReply ? "0" : "1"} />
          {c.needsReply ? <Submit className="btn-primary">対応済みにする</Submit> : <Submit className="btn-secondary">要対応に戻す</Submit>}
        </ActionForm>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <div className="hidden lg:block"><ContactList f={f} activeId={c.id} /></div>

        <div className="card flex flex-col lg:col-span-2">
          {/* 新しい順に並べて column-reverse で表示すると、最初から最新のメッセージが見える */}
          <ul className="flex max-h-[60vh] flex-1 flex-col-reverse gap-3 overflow-y-auto p-4">
            {messages.length === 0 && <li className="py-10 text-center text-sm text-slate-500">まだやりとりはありません</li>}
            {messages.map((m) => {
              const out = m.direction === "OUT";
              const event = m.type === "follow" || m.type === "unfollow" || m.type === "postback";
              if (event) return <li key={m.id} className="text-center text-[11px] text-slate-400">{m.text}・{fmtDateTime(m.createdAt).slice(5)}</li>;
              return (
                <li key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] ${out ? "items-end" : "items-start"} flex flex-col`}>
                    <div className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${out ? (m.auto ? "bg-slate-100 text-slate-700" : "bg-brand-600 text-white") : "border border-slate-200 bg-white"}`}>
                      {m.type === "image" ? <a href={`/inbox/media/${m.id}`} target="_blank" className="underline">画像を開く</a>
                        : ["file", "video", "audio"].includes(m.type) ? <a href={`/inbox/media/${m.id}`} target="_blank" className="underline">{m.text}</a>
                        : m.text}
                    </div>
                    <span className="mt-0.5 text-[11px] text-slate-400">
                      {out ? (m.staff ? m.staff.name : "自動送信") : m.auto ? "ボタン操作" : ""} {fmtDateTime(m.createdAt).slice(5)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="border-t p-4">
            {!c.followed ? (
              <p className="text-sm text-red-700">この相手はブロック・友だち解除しているため、送信できません。</p>
            ) : (
              <ActionForm action={sendReply} resetOnSuccess className="space-y-2">
                <input type="hidden" name="contactId" value={c.id} />
                <textarea id="reply" className="input" name="body" rows={3} placeholder="LINEで返信（送信すると対応済みになります）" required maxLength={4900} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Templates items={TEMPLATES} />
                  <Submit>送信</Submit>
                </div>
              </ActionForm>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {member ? (
            <>
              <MemberPanel memberId={member.id} contactId={c.id} />
              {member.children.map((ch) => <MemberPanel key={ch.id} memberId={ch.id} contactId={c.id} child />)}
            </>
          ) : <LinkPanel contactId={c.id} q={sp.mq} f={f} />}
          {member && (
            <details className="card p-4 text-sm">
              <summary className="cursor-pointer text-slate-500">会員とのつながりを変更</summary>
              <div className="mt-3"><LinkPanel contactId={c.id} q={sp.mq} f={f} linked /></div>
            </details>
          )}
        </div>
      </div>
    </>
  );
}

async function MemberPanel({ memberId, contactId, child }: { memberId: string; contactId: string; child?: boolean }) {
  const now = new Date();
  const [m, lessons, credits] = await Promise.all([
    db.member.findUniqueOrThrow({ where: { id: memberId }, include: { enrollments: { include: { schoolClass: true } } } }),
    db.reservation.findMany({
      where: { memberId, status: "RESERVED", slot: { status: "OPEN", startsAt: { gt: now, lte: new Date(now.getTime() + 35 * 86400_000) } } },
      include: { slot: true },
      orderBy: { slot: { startsAt: "asc" } },
      take: 8,
    }),
    availableCredits(memberId),
  ]);
  const classes = m.enrollments.filter((e) => !e.endDate || e.endDate.getTime() + 86400_000 > now.getTime());
  const cands = credits[0] ? (await makeupCandidates(memberId, credits[0])).slice(0, 30) : [];
  return (
    <>
      <div className={`card p-4 text-sm ${child ? "border-amber-300" : ""}`}>
        {child && <p className="mb-1 text-[11px] font-bold text-amber-700">お子さま{gradeLabel(m.birthDate) ? `・${gradeLabel(m.birthDate)}` : ""}</p>}
        <Link href={`/members/${m.id}`} className="font-semibold text-brand-700 hover:underline">{m.lastName} {m.firstName}</Link>
        <span className="ml-2 text-xs text-slate-500">No.{String(m.memberNo).padStart(6, "0")}</span>
        {m.status !== "ACTIVE" && <span className="ml-2"><Badge tone="yellow">休会・退会</Badge></span>}
        <p className="mt-2 text-xs text-slate-500">{classes.length ? classes.map((e) => e.schoolClass.name).join("、") : "在籍クラスなし"}</p>
        {m.phone && <p className="mt-1 text-xs text-slate-500">{m.phone}</p>}
      </div>

      <div className="card p-4">
        <h2 className="mb-2 text-sm font-semibold">これからの予定</h2>
        {lessons.length === 0 ? <p className="text-xs text-slate-500">5週間以内の予定はありません</p> : (
          <ul className="space-y-2">
            {lessons.map((r) => (
              <li key={r.id} className="text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span>
                    <Link href={`/schedule/${r.slotId}`} className="hover:underline">{fmtWeekday(r.slot.startsAt)} {fmtTime(r.slot.startsAt)}</Link>
                    <span className="block text-xs text-slate-500">{r.slot.title}{r.kind === "MAKEUP" ? "（振替）" : ""}</span>
                  </span>
                  {r.kind === "REGULAR" && (
                    <ActionForm action={staffAbsence} confirm="この回を欠席にして、振替を付与しますか？（会員にLINEで知らせます）">
                      <input type="hidden" name="reservationId" value={r.id} />
                      <input type="hidden" name="contactId" value={contactId} />
                      <Submit className="btn-secondary btn-sm whitespace-nowrap">欠席受付</Submit>
                    </ActionForm>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-4">
        <h2 className="mb-2 text-sm font-semibold">振替 {credits.length}回</h2>
        {credits.length === 0 ? <p className="text-xs text-slate-500">使える振替はありません</p> : (
          <>
            <p className="mb-2 text-xs text-slate-500">いちばん早い期限 {fmtDate(credits[0].expiresAt)}</p>
            {cands.length === 0 ? <p className="text-xs text-slate-500">空きのある回がありません</p> : (
              <ActionForm action={staffMakeup} className="space-y-2" confirm="この回に振替を予約しますか？（会員にLINEで知らせます）">
                <input type="hidden" name="memberId" value={memberId} />
                <input type="hidden" name="contactId" value={contactId} />
                <select className="input text-sm" name="pick" required>
                  {cands.map((s) => <option key={s.id} value={`${credits[0].id}:${s.id}`}>{fmtWeekday(s.startsAt)} {fmtTime(s.startsAt)} {s.title}（残{s.left}）</option>)}
                </select>
                <Submit className="btn-primary btn-sm">代わりに振替を予約</Submit>
              </ActionForm>
            )}
          </>
        )}
      </div>
    </>
  );
}

async function LinkPanel({ contactId, q, f, linked }: { contactId: string; q?: string; f: Filter; linked?: boolean }) {
  const cands = q
    ? await db.member.findMany({
        where: { status: { not: "WITHDRAWN" }, OR: [{ lastName: { contains: q } }, { firstName: { contains: q } }, { lastKana: { contains: q } }, { firstKana: { contains: q } }, { phone: { contains: q } }] },
        take: 8,
      })
    : [];
  return (
    <div className={linked ? "" : "card p-4"}>
      {!linked && (
        <>
          <h2 className="text-sm font-semibold">会員とつなぐ</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">このLINEの相手を会員につなぐと、トーク画面から欠席連絡・振替予約ができるようになり、ここに予定が表示されます。本人が会員ページに「LINEでログイン」しても自動でつながります。</p>
        </>
      )}
      <form className="mt-3 flex gap-2">
        <input type="hidden" name="f" value={f} />
        <input className="input text-sm" name="mq" defaultValue={q} placeholder="氏名・カナ・電話" />
        <button className="btn-secondary btn-sm">検索</button>
      </form>
      {q && cands.length === 0 && <p className="mt-2 text-xs text-slate-500">該当する会員がいません</p>}
      <ul className="mt-2 space-y-2">
        {cands.map((m) => (
          <li key={m.id}>
            <ActionForm action={linkMember} className="flex items-center justify-between gap-2" confirm={`${m.lastName} ${m.firstName}さんとつなぎますか？`}>
              <input type="hidden" name="contactId" value={contactId} />
              <input type="hidden" name="memberId" value={m.id} />
              <span className="text-sm">{m.lastName} {m.firstName}{m.lineUserId && <span className="ml-1 text-[11px] text-amber-700">LINE連携済み</span>}</span>
              <Submit className="btn-secondary btn-sm">つなぐ</Submit>
            </ActionForm>
          </li>
        ))}
      </ul>
      {linked && (
        <ActionForm action={linkMember} className="mt-3" confirm="会員とのつながりを外しますか？">
          <input type="hidden" name="contactId" value={contactId} />
          <input type="hidden" name="memberId" value="" />
          <Submit className="btn-secondary btn-sm text-red-700">つながりを外す</Submit>
        </ActionForm>
      )}
    </div>
  );
}
