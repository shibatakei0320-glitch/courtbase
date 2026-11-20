import Link from "next/link";
import { ActionForm, Submit } from "@/components/ActionForm";
import { db } from "@/lib/db";
import { gradeLabel } from "@/lib/school";
import { setGuardian } from "../actions";

/** 家族（保護者・お子さま）。ジュニア会員は保護者のLINE・会員ページで手続きする */
export async function FamilyPanel({ memberId, gq }: { memberId: string; gq?: string }) {
  const m = await db.member.findUniqueOrThrow({ where: { id: memberId }, include: { guardian: true, children: { orderBy: { birthDate: "asc" } } } });
  const cands = gq
    ? await db.member.findMany({
        where: { id: { not: memberId }, guardianId: null, status: { not: "WITHDRAWN" }, OR: [{ lastName: { contains: gq } }, { firstName: { contains: gq } }, { lastKana: { contains: gq } }, { phone: { contains: gq } }] },
        take: 6,
      })
    : [];
  return (
    <div className="card p-4 text-sm">
      <h2 className="mb-2 font-semibold">家族</h2>
      {m.guardian ? (
        <div className="flex items-center justify-between gap-2">
          <span>保護者：<Link className="text-brand-700 hover:underline" href={`/members/${m.guardian.id}`}>{m.guardian.lastName} {m.guardian.firstName}</Link>{m.guardian.lineUserId ? <span className="ml-1 text-xs text-emerald-700">LINE連携済み</span> : <span className="ml-1 text-xs text-amber-700">LINE未連携</span>}</span>
          <ActionForm action={setGuardian} confirm="保護者の設定を外しますか？">
            <input type="hidden" name="id" value={m.id} />
            <Submit className="text-xs text-red-700 underline">外す</Submit>
          </ActionForm>
        </div>
      ) : (
        <>
          {m.children.length > 0 && (
            <ul className="mb-2 space-y-1">
              {m.children.map((c) => (
                <li key={c.id}>お子さま：<Link className="text-brand-700 hover:underline" href={`/members/${c.id}`}>{c.lastName} {c.firstName}</Link>{gradeLabel(c.birthDate) && <span className="ml-1 text-xs text-slate-500">{gradeLabel(c.birthDate)}</span>}</li>
              ))}
            </ul>
          )}
          <Link className="btn-secondary btn-sm" href={`/members/new?guardian=${m.id}`}>お子さまを登録</Link>
          {m.children.length === 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-slate-500">この会員の保護者を設定（ジュニア会員の場合）</summary>
              <form className="mt-2 flex gap-2">
                <input className="input text-sm" name="gq" defaultValue={gq} placeholder="保護者の氏名・電話" />
                <button className="btn-secondary btn-sm">検索</button>
              </form>
              <ul className="mt-2 space-y-1">
                {cands.map((c) => (
                  <li key={c.id}>
                    <ActionForm action={setGuardian} className="flex items-center justify-between gap-2" confirm={`${c.lastName} ${c.firstName}さんを保護者にしますか？`}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="guardianId" value={c.id} />
                      <span>{c.lastName} {c.firstName}</span>
                      <Submit className="btn-secondary btn-sm">保護者にする</Submit>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
