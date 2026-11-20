import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { canManage, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { RES_STATUS, SLOT_KIND, fmtDate, fmtDateTime, fmtTime, jstDateKey, yen } from "@/lib/format";
import { addReservation, cancelSlot, deleteCategory, deleteSlot, saveCategory, sendEntryMessage, sendEventMessage, setPublicEntries, setReservationStatus, updateSlot } from "../actions";
import { FORMAT_LABEL, categoryLabel, entryName, entrySize } from "@/lib/entry";
import { lineMessagingConfigured } from "@/lib/line-message";
import type { EventCategory } from "@prisma/client";

export const metadata = { title: "枠の詳細" };

const TONE = { RESERVED: "blue", ATTENDED: "green", NO_SHOW: "red", CANCELED: "gray" } as const;

export default async function SlotPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const me = await requireStaff();
  const { id } = await params;
  const { q } = await searchParams;
  const slot = await db.slot.findUnique({
    where: { id },
    include: {
      court: true,
      program: true,
      instructor: true,
      schoolClass: { include: { level: true } },
      reservations: { include: { member: { include: { plan: true } }, category: true }, orderBy: { createdAt: "asc" } },
      categories: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { _count: { select: { waitlist: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!slot) notFound();
  const [courts, staff] = await Promise.all([
    db.court.findMany({ orderBy: { sortOrder: "asc" } }),
    db.staff.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const activeCount = slot.reservations.filter((r) => r.status === "RESERVED" || r.status === "ATTENDED").length;
  const candidates = q
    ? await db.member.findMany({
        where: {
          status: "ACTIVE",
          OR: [
            { lastName: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } },
            { lastKana: { contains: q } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } },
            ...(Number.isInteger(Number(q)) ? [{ memberNo: Number(q) }] : []),
          ],
        },
        include: { plan: true },
        take: 10,
      })
    : [];
  const isEvent = slot.kind === "EVENT";
  const cats = slot.categories;
  const activeRes = slot.reservations.filter((r) => r.status === "RESERVED" || r.status === "ATTENDED");
  const countBy = (cid: string) => activeRes.filter((r) => r.categoryId === cid).length;
  const noLine = new Set(activeRes.filter((r) => !r.member.lineUserId).map((r) => r.memberId)).size;
  const groups = cats.length
    ? [...cats.map((c) => ({ key: c.id, title: categoryLabel(c), sub: `${FORMAT_LABEL[c.format]}・${countBy(c.id)}/${c.capacity}組`, rows: slot.reservations.filter((r) => r.categoryId === c.id) })),
       ...(slot.reservations.some((r) => !r.categoryId || !cats.some((c) => c.id === r.categoryId)) ? [{ key: "none", title: "種目なし", sub: "", rows: slot.reservations.filter((r) => !r.categoryId || !cats.some((c) => c.id === r.categoryId)) }] : [])]
    : [{ key: "all", title: "", sub: "", rows: slot.reservations }];
  const duration = Math.round((slot.endsAt.getTime() - slot.startsAt.getTime()) / 60000);
  const canceled = slot.status === "CANCELED";

  return (
    <>
      <PageHeader title={slot.title} back={`/schedule?date=${jstDateKey(slot.startsAt)}`} />
      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
        <span>{fmtDateTime(slot.startsAt)}〜{fmtTime(slot.endsAt)}</span>
        <span>{slot.court.name}</span>
        <span>{SLOT_KIND[slot.kind]}</span>
        <span>予約 {activeCount}/{slot.capacity}</span>
        {!slot.classId && <span>{cats.length ? "参加費は種目ごと" : yen(slot.price)}</span>}
        {slot.instructor && <span>担当 {slot.instructor.name}</span>}
        {slot.schoolClass && <Link href={`/classes/${slot.schoolClass.id}`} className="text-brand-700 hover:underline">クラス：{slot.schoolClass.name}{slot.schoolClass.level ? `（${slot.schoolClass.level.name}）` : ""}</Link>}
        {canceled && <Badge tone="red">{slot.classId ? "休講" : "中止"}</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {isEvent && <CategoryManager slotId={slot.id} cats={cats} countBy={countBy} publicEntries={slot.publicEntries} />}
          {isEvent && cats.length > 0 && (
            <Link href={`/schedule/${slot.id}/draw`} className="card flex items-center justify-between px-4 py-3 hover:bg-slate-50">
              <span className="font-semibold">対戦表・試合結果</span>
              <span className="text-sm text-brand-700">開く →</span>
            </Link>
          )}

          <div className="card overflow-x-auto">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="font-semibold">{cats.length ? "エントリー" : "参加者"}</h2>
              {cats.length > 0 && activeRes.length > 0 && <a href={`/schedule/${slot.id}/entries`} className="text-sm text-brand-700 hover:underline">CSVでダウンロード</a>}
            </div>
            {slot.reservations.length === 0 ? <Empty>{cats.length ? "エントリーはまだありません" : "予約はまだありません"}</Empty> : (
              <table className="table">
                <thead><tr><th>{cats.length ? "代表者" : "会員"}</th><th>{cats.length ? "エントリー名・メンバー" : "プラン"}</th><th>予約日時</th><th>状態</th><th>操作</th></tr></thead>
                {groups.map((g) => (
                <tbody key={g.key}>
                  {g.title && (
                    <tr className="bg-slate-50"><td colSpan={5} className="font-semibold">{g.title}<span className="ml-2 text-xs font-normal text-slate-500">{g.sub}</span></td></tr>
                  )}
                  {g.rows.length === 0 && g.title && <tr><td colSpan={5} className="text-xs text-slate-400">まだエントリーはありません</td></tr>}
                  {g.rows.map((r) => (
                    <tr key={r.id}>
                      <td><Link href={`/members/${r.memberId}`} className="text-brand-700 hover:underline">{r.member.lastName} {r.member.firstName}</Link>{r.kind === "REGULAR" && <span className="ml-1"><Badge>在籍</Badge></span>}{r.kind === "MAKEUP" && <span className="ml-1"><Badge tone="yellow">振替</Badge></span>}{!r.member.lineUserId && <span className="ml-1 text-xs text-slate-400">LINE未連携</span>}</td>
                      <td>{cats.length ? <><span className="font-medium">{r.teamName ?? ""}</span>{r.players.length > 0 && <span className={r.teamName ? "ml-2 text-xs text-slate-500" : ""}>{r.players.join(" / ")}</span>}</> : (r.member.plan?.name ?? "-")}</td>
                      <td>{fmtDateTime(r.createdAt)}</td>
                      <td><Badge tone={TONE[r.status]}>{r.kind === "REGULAR" && r.status === "CANCELED" ? "欠席連絡" : RES_STATUS[r.status]}</Badge></td>
                      <td>
                        {r.status === "CANCELED" && r.kind === "REGULAR" && !canceled && <StatusBtn id={r.id} status="RESERVED" label="欠席を取り消す" />}
                        {r.status !== "CANCELED" && (
                          <div className="flex gap-1">
                            {r.status !== "ATTENDED" && <StatusBtn id={r.id} status="ATTENDED" label="出席" />}
                            {r.status !== "NO_SHOW" && <StatusBtn id={r.id} status="NO_SHOW" label={slot.classId ? "無断欠席" : "欠席"} />}
                            {r.status !== "RESERVED" && <StatusBtn id={r.id} status="RESERVED" label="予約中に戻す" />}
                            {r.kind === "REGULAR" ? (r.status === "RESERVED" && <StatusBtn id={r.id} status="CANCELED" label="欠席連絡（振替付与）" confirmText="欠席にして、振替の権利を発行しますか？" />)
                              : r.kind === "MAKEUP" ? <StatusBtn id={r.id} status="CANCELED" label="振替取消" confirmText="振替を取り消しますか？（振替の権利は会員に戻ります）" />
                              : <StatusBtn id={r.id} status="CANCELED" label="取消" danger />}
                            {isEvent && r.member.lineUserId && (
                              <details className="relative">
                                <summary className="btn-secondary btn-sm cursor-pointer list-none">LINE</summary>
                                <div className="absolute right-0 z-10 mt-2 w-72 rounded-lg border bg-white p-3 shadow-lg">
                                  <ActionForm action={sendEntryMessage} confirm="LINEで送信しますか？" className="space-y-2" resetOnSuccess>
                                    <input type="hidden" name="reservationId" value={r.id} />
                                    <p className="text-xs text-slate-500">{r.member.lastName} {r.member.firstName}さんのLINEに送ります</p>
                                    <textarea className="input" name="body" rows={4} required maxLength={2000} />
                                    <Submit className="btn-primary btn-sm">送信</Submit>
                                  </ActionForm>
                                </div>
                              </details>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                ))}
              </table>
            )}
          </div>

          {isEvent && activeRes.length > 0 && (
            <div className="card p-4">
              <h2 className="mb-1 font-semibold">参加者へ連絡（LINE）</h2>
              <p className="mb-3 text-xs text-slate-500">
                エントリーした代表者のLINEに届きます。{noLine > 0 && `LINE未連携の${noLine}名には届きません。`}
                {!lineMessagingConfigured() && <b className="text-amber-700"> LINE公式アカウントの設定がまだのため、今は送信できません。</b>}
              </p>
              <ActionForm action={sendEventMessage} confirm="この内容をLINEで送信しますか？（送信後は取り消せません）" className="space-y-3" resetOnSuccess>
                <input type="hidden" name="slotId" value={slot.id} />
                {cats.length > 0 && (
                  <label className="block"><span className="label">送信先</span>
                    <select className="input" name="categoryId" defaultValue="">
                      <option value="">全員（{activeRes.length}組）</option>
                      {cats.map((c) => <option key={c.id} value={c.id}>{categoryLabel(c)}（{countBy(c.id)}組）</option>)}
                    </select>
                  </label>
                )}
                <label className="block"><span className="label">本文</span><textarea className="input" name="body" rows={5} maxLength={2000} required placeholder="例：当日の受付は9:00からです。駐車場は台数に限りがあります。" /></label>
                <Submit>LINEで送信</Submit>
              </ActionForm>
              {slot.messages.length > 0 && (
                <div className="mt-5 border-t pt-4">
                  <h3 className="mb-2 text-sm font-semibold">送信履歴</h3>
                  <ul className="space-y-3">
                    {slot.messages.map((m) => (
                      <li key={m.id} className="text-sm">
                        <p className="text-xs text-slate-500">{fmtDateTime(m.createdAt)}・{m.categoryId ? categoryLabel(cats.find((c) => c.id === m.categoryId) ?? { name: "削除された種目", level: null }) : "全員"}・{m.sentCount}/{m.totalCount}名に送信</p>
                        <p className="whitespace-pre-wrap">{m.body}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {!canceled && (
            <div className="card p-4">
              <h2 className="mb-3 font-semibold">{cats.length ? "エントリーを代理で登録" : "予約を追加"}</h2>
              <form className="mb-3 flex gap-2">
                <input className="input" name="q" defaultValue={q} placeholder="会員を検索（氏名・カナ・電話・会員番号）" />
                <button className="btn-secondary">検索</button>
              </form>
              {q && candidates.length === 0 && <p className="text-sm text-slate-500">該当する有効会員がいません</p>}
              <ul className="divide-y">
                {candidates.map((m) => (
                  <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{m.lastName} {m.firstName}<span className="ml-2 text-xs text-slate-400">No.{m.memberNo}・{m.plan?.name ?? "プランなし"}</span></span>
                    {cats.length ? (
                      <details className="relative">
                        <summary className="btn-primary btn-sm cursor-pointer list-none">エントリー登録</summary>
                        <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border bg-white p-4 shadow-lg">
                          <ActionForm action={addReservation} className="space-y-3">
                            <input type="hidden" name="slotId" value={slot.id} />
                            <input type="hidden" name="memberId" value={m.id} />
                            <label className="block"><span className="label">種目</span>
                              <select className="input" name="categoryId" required>{cats.map((c) => <option key={c.id} value={c.id}>{categoryLabel(c)}（{FORMAT_LABEL[c.format]}{c.format === "TEAM" ? `・${entrySize(c)}名` : ""}）</option>)}</select>
                            </label>
                            <label className="block"><span className="label">チーム名（団体戦のみ）</span><input className="input" name="teamName" /></label>
                            <label className="block"><span className="label">代表者以外のメンバー（1行に1名。シングルスは不要）</span><textarea className="input" name="players" rows={3} /></label>
                            <Submit className="btn-primary btn-sm">登録</Submit>
                          </ActionForm>
                        </div>
                      </details>
                    ) : (
                      <ActionForm action={addReservation}>
                        <input type="hidden" name="slotId" value={slot.id} />
                        <input type="hidden" name="memberId" value={m.id} />
                        <Submit className="btn-primary btn-sm">予約</Submit>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card p-4">
            <h2 className="mb-3 font-semibold">枠の編集</h2>
            <ActionForm action={updateSlot} className="space-y-3">
              <input type="hidden" name="id" value={slot.id} />
              <label className="block"><span className="label">タイトル</span><input className="input" name="title" defaultValue={slot.title} required /></label>
              <label className="block"><span className="label">コート</span>
                <select className="input" name="courtId" defaultValue={slot.courtId}>{courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><span className="label">日付</span><input className="input" type="date" name="date" defaultValue={jstDateKey(slot.startsAt)} /></label>
                <label className="block"><span className="label">開始</span><input className="input" type="time" name="time" step={900} defaultValue={fmtTime(slot.startsAt)} /></label>
                <label className="block"><span className="label">時間(分)</span><input className="input" type="number" name="durationMin" min={15} step={15} defaultValue={duration} /></label>
                {cats.length ? (
                  <><input type="hidden" name="capacity" value={slot.capacity} /><input type="hidden" name="price" value={slot.price} /></>
                ) : (
                  <>
                    <label className="block"><span className="label">定員</span><input className="input" type="number" name="capacity" min={1} defaultValue={slot.capacity} /></label>
                    <label className="block"><span className="label">料金</span><input className="input" type="number" name="price" min={0} defaultValue={slot.price} /></label>
                  </>
                )}
              </div>
              <label className="block"><span className="label">担当</span>
                <select className="input" name="instructorId" defaultValue={slot.instructorId ?? ""}>
                  <option value="">なし</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="block"><span className="label">メモ</span><textarea className="input" name="note" rows={2} defaultValue={slot.note ?? ""} /></label>
              <Submit>更新</Submit>
            </ActionForm>
          </div>
          {!canceled && (
            <div className="card p-4">
              <h2 className="mb-2 font-semibold text-red-700">{slot.classId ? "休講" : "枠の中止"}</h2>
              <p className="mb-3 text-xs text-slate-500">{slot.classId ? "在籍者には振替の権利を発行し、振替で予約していた人には権利を戻します。" : "この枠の予約はすべてキャンセルされ、カードで支払い済みの分は全額返金されます。会員にはLINEでお知らせします。"}</p>
              <ActionForm action={cancelSlot} confirm={slot.classId ? "この回を休講にしますか？" : "この枠を中止しますか？（カードで支払い済みの予約は全額返金されます）"}>
                <input type="hidden" name="id" value={slot.id} />
                <Submit className="btn-danger">{slot.classId ? "休講にする" : "中止する"}</Submit>
              </ActionForm>
            </div>
          )}
          {canManage(me.role) && slot.reservations.every((r) => r.status === "CANCELED") && (
            <form action={deleteSlot} className="card p-4">
              <input type="hidden" name="id" value={slot.id} />
              <button className="btn-secondary w-full text-red-700">枠を削除</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

function StatusBtn({ id, status, label, danger, confirmText }: { id: string; status: string; label: string; danger?: boolean; confirmText?: string }) {
  return (
    <ActionForm action={setReservationStatus} confirm={confirmText ?? (danger ? "この予約を取り消しますか？（カードで支払い済みの場合は全額返金されます）" : undefined)}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Submit className={`${danger ? "btn-danger" : "btn-secondary"} btn-sm`}>{label}</Submit>
    </ActionForm>
  );
}

type CatRow = EventCategory & { _count: { waitlist: number } };

function CategoryManager({ slotId, cats, countBy, publicEntries }: { slotId: string; cats: CatRow[]; countBy: (id: string) => number; publicEntries: boolean }) {
  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="font-semibold">種目・レベル</h2>
        <ActionForm action={setPublicEntries} className="flex items-center gap-2 text-sm">
          <input type="hidden" name="slotId" value={slotId} />
          <input type="hidden" name="publicEntries" value={publicEntries ? "" : "on"} />
          <span className="text-slate-600">エントリー一覧：{publicEntries ? <b className="text-emerald-700">会員ページに公開中</b> : "非公開"}</span>
          <Submit className="btn-secondary btn-sm">{publicEntries ? "非公開にする" : "公開する"}</Submit>
        </ActionForm>
      </div>
      {cats.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-500">種目を追加すると、会員は種目を選んでエントリーします（種目ごとに定員と参加費を設定）。種目がない場合は、枠の定員・料金で申込みを受け付けます。</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>種目</th><th>形式</th><th className="whitespace-nowrap">組数</th><th className="whitespace-nowrap">参加費</th><th></th></tr></thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{categoryLabel(c)}</td>
                <td>{FORMAT_LABEL[c.format]}{c.format === "TEAM" && <span className="text-xs text-slate-500">（{entrySize(c)}名）</span>}</td>
                <td className="whitespace-nowrap">{countBy(c.id)} / {c.capacity}組{c._count.waitlist > 0 && <span className="block text-xs text-amber-700">キャンセル待ち {c._count.waitlist}名</span>}</td>
                <td className="whitespace-nowrap">{c.price > 0 ? yen(c.price) : "無料"}{c.earlyPrice != null && c.earlyUntil && <span className="block text-xs text-slate-500">早期 {yen(c.earlyPrice)}（〜{fmtDate(c.earlyUntil)}）</span>}</td>
                <td className="whitespace-nowrap">
                  <details className="relative">
                    <summary className="cursor-pointer text-brand-700">編集</summary>
                    <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border bg-white p-4 shadow-lg">
                      <CategoryForm slotId={slotId} c={c} />
                      <ActionForm action={deleteCategory} confirm="この種目を削除しますか？" className="mt-3 border-t pt-3">
                        <input type="hidden" name="id" value={c.id} />
                        <Submit className="btn-secondary btn-sm text-red-700">種目を削除</Submit>
                      </ActionForm>
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      <details className="border-t px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-brand-700">＋ 種目を追加</summary>
        <div className="mt-3 max-w-md"><CategoryForm slotId={slotId} /></div>
      </details>
    </div>
  );
}

function CategoryForm({ slotId, c }: { slotId: string; c?: EventCategory }) {
  return (
    <ActionForm action={saveCategory} className="space-y-3" resetOnSuccess={!c}>
      <input type="hidden" name="slotId" value={slotId} />
      {c && <input type="hidden" name="id" value={c.id} />}
      <label className="block"><span className="label">種目名</span><input className="input" name="name" defaultValue={c?.name} required placeholder="例：男子ダブルス、ミックスダブルス、団体戦" /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="label">形式</span>
          <select className="input" name="format" defaultValue={c?.format ?? "DOUBLES"}>
            <option value="SINGLES">シングルス</option><option value="DOUBLES">ダブルス</option><option value="TEAM">団体戦</option>
          </select>
        </label>
        <label className="block"><span className="label">レベル</span><input className="input" name="level" defaultValue={c?.level ?? ""} placeholder="例：初級、DUPR 3.0〜3.5" /></label>
        <label className="block"><span className="label">定員（組）</span><input className="input" type="number" name="capacity" min={1} defaultValue={c?.capacity ?? 16} /></label>
        <label className="block"><span className="label">参加費（1組）</span><input className="input" type="number" name="price" min={0} step={100} defaultValue={c?.price ?? 0} /></label>
        <label className="block"><span className="label">早期料金（任意）</span><input className="input" type="number" name="earlyPrice" min={0} step={100} defaultValue={c?.earlyPrice ?? ""} /></label>
        <label className="block"><span className="label">早期割引の締切日</span><input className="input" type="date" name="earlyUntil" defaultValue={c?.earlyUntil ? jstDateKey(c.earlyUntil) : ""} /></label>
        <label className="block"><span className="label">団体戦の人数</span><input className="input" type="number" name="teamSize" min={2} max={20} defaultValue={c?.teamSize ?? 4} /></label>
        <label className="block"><span className="label">表示順</span><input className="input" type="number" name="sortOrder" defaultValue={c?.sortOrder ?? 0} /></label>
      </div>
      <Submit>{c ? "更新" : "追加"}</Submit>
    </ActionForm>
  );
}
