import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Empty, PageHeader, Pager } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, fmtDate, fmtDateTime, jstDateKey } from "@/lib/format";
import { LEVEL_RULE, schoolSettings, todayKey } from "@/lib/school";
import { issueCredit, updateCredit } from "../classes/actions";

export const metadata = { title: "振替" };
const PER = 50;
const FILTERS = { available: "未使用", used: "使用済み", expired: "期限切れ", void: "無効", all: "すべて" } as const;
type Filter = keyof typeof FILTERS;

export default async function MakeupsPage({ searchParams }: { searchParams: Promise<{ f?: string; page?: string; q?: string; member?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const f: Filter = sp.f && sp.f in FILTERS ? (sp.f as Filter) : "available";
  const page = Math.max(1, Number(sp.page) || 1);
  const now = new Date();
  const byMember: Prisma.MakeupCreditWhereInput = sp.member ? { memberId: sp.member } : {};
  const where: Prisma.MakeupCreditWhereInput = { ...byMember, ...(
    f === "available" ? { status: "AVAILABLE", expiresAt: { gt: now } }
    : f === "expired" ? { status: "AVAILABLE", expiresAt: { lte: now } }
    : f === "used" ? { status: "USED" }
    : f === "void" ? { status: "VOID" }
    : {}) };
  const [total, credits, settings, levels] = await Promise.all([
    db.makeupCredit.count({ where }),
    db.makeupCredit.findMany({ where, include: { member: true }, orderBy: f === "available" ? { expiresAt: "asc" } : { createdAt: "desc" }, skip: (page - 1) * PER, take: PER }),
    schoolSettings(),
    db.level.findMany({ orderBy: { rank: "asc" } }),
  ]);
  // 欠席した回・振替先の回をまとめて引く
  const resIds = credits.flatMap((c) => [c.sourceReservationId, c.usedReservationId]).filter((x): x is string => !!x);
  const resv = await db.reservation.findMany({ where: { id: { in: resIds } }, include: { slot: { select: { id: true, title: true, startsAt: true } } } });
  const slotOf = new Map(resv.map((r) => [r.id, r.slot]));
  const q = sp.q?.trim();
  const candidates = q
    ? await db.member.findMany({
        where: { status: "ACTIVE", OR: [{ lastName: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }, { lastKana: { contains: q } }, { phone: { contains: q } }, ...(Number.isInteger(Number(q)) ? [{ memberNo: Number(q) }] : [])] },
        take: 8,
      })
    : [];
  const defaultExp = addDays(todayKey(), settings.makeupValidDays);

  return (
    <>
      <PageHeader title="振替" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <nav className="flex flex-wrap gap-1">
            {(Object.keys(FILTERS) as Filter[]).map((k) => (
              <Link key={k} href={`/makeups?f=${k}${sp.member ? `&member=${sp.member}` : ""}`} className={`rounded-full px-3 py-1 text-sm ${k === f ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>{FILTERS[k]}</Link>
            ))}
          </nav>
          <div className="card overflow-x-auto">
            {credits.length === 0 ? <Empty>該当する振替はありません</Empty> : (
              <table className="table">
                <thead><tr><th>会員</th><th>発行理由・欠席した回</th><th>有効期限</th><th>状態・振替先</th><th></th></tr></thead>
                <tbody>
                  {credits.map((c) => {
                    const src = c.sourceReservationId ? slotOf.get(c.sourceReservationId) : null;
                    const used = c.usedReservationId ? slotOf.get(c.usedReservationId) : null;
                    const expired = c.status === "AVAILABLE" && c.expiresAt <= now;
                    return (
                      <tr key={c.id}>
                        <td><Link className="text-brand-700 hover:underline" href={`/members/${c.memberId}`}>{c.member.lastName} {c.member.firstName}</Link></td>
                        <td>
                          <span className="block">{c.reason}</span>
                          {src && <Link href={`/schedule/${src.id}`} className="text-xs text-slate-500 hover:underline">{fmtDateTime(src.startsAt)} {src.title}</Link>}
                          {c.note && <span className="block text-xs text-slate-500">{c.note}</span>}
                        </td>
                        <td className="whitespace-nowrap">{fmtDate(c.expiresAt)}</td>
                        <td>
                          {c.status === "USED" ? <><Badge tone="green">使用済み</Badge>{used && <Link href={`/schedule/${used.id}`} className="mt-1 block text-xs text-slate-500 hover:underline">{fmtDateTime(used.startsAt)} {used.title}</Link>}</>
                            : c.status === "VOID" ? <Badge>無効</Badge>
                            : expired ? <Badge tone="red">期限切れ</Badge>
                            : <Badge tone="blue">未使用</Badge>}
                        </td>
                        <td>
                          {c.status === "AVAILABLE" && (
                            <details className="relative">
                              <summary className="cursor-pointer text-sm text-brand-700">変更</summary>
                              <div className="absolute right-0 z-10 mt-2 w-72 space-y-4 rounded-lg border bg-white p-4 shadow-lg">
                                <ActionForm action={updateCredit} className="space-y-2">
                                  <input type="hidden" name="id" value={c.id} />
                                  <label className="block"><span className="label">有効期限</span><input className="input" type="date" name="expiresAt" defaultValue={jstDateKey(c.expiresAt)} /></label>
                                  <Submit className="btn-secondary btn-sm">期限を変更</Submit>
                                </ActionForm>
                                <ActionForm action={updateCredit} className="space-y-2 border-t pt-3" confirm="この振替の権利を無効にしますか？">
                                  <input type="hidden" name="id" value={c.id} />
                                  <input type="hidden" name="op" value="void" />
                                  <input className="input" name="note" placeholder="理由（任意）" />
                                  <Submit className="btn-danger btn-sm">無効にする</Submit>
                                </ActionForm>
                              </div>
                            </details>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <Pager page={page} total={total} perPage={PER} base={`/makeups?f=${f}${sp.member ? `&member=${sp.member}` : ""}`} />
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5 text-sm leading-relaxed text-slate-600">
            <h2 className="mb-2 font-semibold text-slate-900">いまのルール</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>欠席連絡：{settings.absenceDeadlineHours > 0 ? `開始の${settings.absenceDeadlineHours}時間前まで` : "開始時刻まで"}</li>
              <li>振替の有効期限：欠席した日から{settings.makeupValidDays}日</li>
              <li>振替できるレベル：{LEVEL_RULE[settings.levelRule]}</li>
              <li>振替予約のキャンセル：開始の{settings.cancelDeadlineHours}時間前まで（権利は戻ります）</li>
            </ul>
            <p className="mt-2 text-xs">変更は「施設設定」から（オーナー）</p>
          </div>
          <div className="card p-5">
            <h2 className="mb-3 font-semibold">振替を手動で発行</h2>
            <form className="flex gap-2">
              <input type="hidden" name="f" value={f} />
              <input className="input" name="q" defaultValue={q} placeholder="氏名・カナ・電話・会員番号" />
              <button className="btn-secondary">検索</button>
            </form>
            {q && candidates.length === 0 && <p className="mt-3 text-sm text-slate-500">該当する会員がいません</p>}
            {candidates.map((m) => (
              <details key={m.id} className="mt-3 border-t pt-3">
                <summary className="cursor-pointer text-sm font-medium">{m.lastName} {m.firstName}<span className="ml-2 text-xs text-slate-500">No.{String(m.memberNo).padStart(6, "0")}</span></summary>
                <ActionForm action={issueCredit} className="mt-3 space-y-2">
                  <input type="hidden" name="memberId" value={m.id} />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block"><span className="label">件数</span><input className="input" type="number" name="count" min={1} max={10} defaultValue={1} /></label>
                    <label className="block"><span className="label">有効期限</span><input className="input" type="date" name="expiresAt" defaultValue={defaultExp} /></label>
                  </div>
                  <label className="block"><span className="label">振替できるレベル（この段階まで）</span>
                    <select className="input" name="levelRank" defaultValue="">
                      <option value="">制限なし</option>
                      {levels.map((l) => <option key={l.id} value={l.rank}>{l.name}（{l.rank}）</option>)}
                    </select>
                  </label>
                  <label className="block"><span className="label">対象のクラス</span>
                    <select className="input" name="target" defaultValue="">
                      <option value="">成人・ジュニアどちらでも</option>
                      <option value="ADULT">成人のみ</option>
                      <option value="JUNIOR">ジュニアのみ</option>
                    </select>
                  </label>
                  <input className="input" name="note" placeholder="メモ（例：雨天中止の補填）" />
                  <Submit className="btn-primary btn-sm">発行</Submit>
                </ActionForm>
              </details>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
