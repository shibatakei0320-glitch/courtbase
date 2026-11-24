import Link from "next/link";
import type { MemberStatus, Prisma } from "@prisma/client";
import { Badge, Empty, PageHeader, Pager } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { MEMBER_STATUS, fmtDate } from "@/lib/format";
import { SCHOOL } from "@/lib/brand";
import { WEEKDAYS, gradeLabel } from "@/lib/school";

export const metadata = { title: "会員管理" };
const PER = 30;

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; plan?: string; page?: string; target?: string; course?: string; cls?: string; enrolled?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();
  const where: Prisma.MemberWhereInput = {};
  if (q) {
    const no = Number(q);
    where.OR = [
      { lastName: { contains: q, mode: "insensitive" } },
      { firstName: { contains: q, mode: "insensitive" } },
      { lastKana: { contains: q } },
      { firstKana: { contains: q } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      ...(Number.isInteger(no) ? [{ memberNo: no }] : []),
    ];
  }
  if (sp.status && sp.status in MEMBER_STATUS) where.status = sp.status as MemberStatus;
  if (sp.plan) where.planId = sp.plan;
  // スクール：在籍中のクラスで絞り込む
  const now = new Date();
  const enrollWhere: Prisma.EnrollmentWhereInput = {
    startDate: { lte: new Date(now.getTime() + 60 * 86400_000) },
    OR: [{ endDate: null }, { endDate: { gte: new Date(now.getTime() - 86400_000) } }],
    ...(sp.cls ? { classId: sp.cls } : {}),
    ...(sp.target === "JUNIOR" || sp.target === "ADULT" || sp.course ? { schoolClass: { ...(sp.target === "JUNIOR" || sp.target === "ADULT" ? { target: sp.target } : {}), ...(sp.course ? { course: sp.course } : {}) } } : {}),
  };
  if (SCHOOL && (sp.cls || sp.target || sp.course || sp.enrolled === "1")) where.enrollments = { some: enrollWhere };
  if (SCHOOL && sp.enrolled === "0") where.enrollments = { none: { OR: [{ endDate: null }, { endDate: { gte: now } }] } };
  const [members, total, plans] = await Promise.all([
    db.member.findMany({
      where,
      include: { plan: true, guardian: { select: { lastName: true, firstName: true } }, enrollments: { where: { OR: [{ endDate: null }, { endDate: { gte: now } }] }, include: { schoolClass: true, plan: true } } },
      orderBy: { memberNo: "desc" },
      skip: (page - 1) * PER,
      take: PER,
    }),
    db.member.count({ where }),
    db.plan.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const classes = SCHOOL ? await db.schoolClass.findMany({ where: { active: true }, orderBy: [{ weekday: "asc" }, { startTime: "asc" }] }) : [];
  const qs = new URLSearchParams(Object.entries({ q: q ?? "", status: sp.status ?? "", plan: sp.plan ?? "", target: sp.target ?? "", course: sp.course ?? "", cls: sp.cls ?? "", enrolled: sp.enrolled ?? "" }).filter(([, v]) => v));
  return (
    <>
      <PageHeader title="会員管理" actions={<>
        {SCHOOL ? <a href="/members/import-school" className="btn-secondary">会費管理表から取り込み</a> : <a href="/members/import" className="btn-secondary">CSV取り込み</a>}
        <a href={`/members/export?${qs}`} className="btn-secondary">CSV出力</a>
        <Link href="/members/new" className="btn-primary">＋ 新規会員登録</Link>
      </>} />
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <label className="block flex-1 min-w-48"><span className="label">キーワード</span><input className="input" name="q" defaultValue={q} placeholder="氏名・カナ・メール・電話・会員番号" /></label>
        <label className="block"><span className="label">ステータス</span>
          <select className="input" name="status" defaultValue={sp.status ?? ""}>
            <option value="">すべて</option>
            {Object.entries(MEMBER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {SCHOOL && (
          <>
            <label className="block"><span className="label">対象</span>
              <select className="input" name="target" defaultValue={sp.target ?? ""}><option value="">すべて</option><option value="JUNIOR">ジュニア</option><option value="ADULT">成人</option></select>
            </label>
            <label className="block"><span className="label">コース</span>
              <select className="input" name="course" defaultValue={sp.course ?? ""}><option value="">すべて</option><option value="ENJOY">エンジョイ</option><option value="ACADEMY">アカデミー</option></select>
            </label>
            <label className="block"><span className="label">クラス</span>
              <select className="input" name="cls" defaultValue={sp.cls ?? ""}><option value="">すべて</option>{classes.map((c) => <option key={c.id} value={c.id}>{WEEKDAYS[c.weekday]} {c.startTime} {c.name}</option>)}</select>
            </label>
            <label className="block"><span className="label">在籍</span>
              <select className="input" name="enrolled" defaultValue={sp.enrolled ?? ""}><option value="">すべて</option><option value="1">在籍中</option><option value="0">在籍なし</option></select>
            </label>
          </>
        )}
        {!SCHOOL && <label className="block"><span className="label">プラン</span>
          <select className="input" name="plan" defaultValue={sp.plan ?? ""}>
            <option value="">すべて</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>}
        <button className="btn-primary">検索</button>
      </form>
      <div className="card overflow-x-auto">
        {members.length === 0 ? <Empty>該当する会員がいません</Empty> : (
          <table className="table">
            <thead><tr><th>会員番号</th><th>氏名</th>{SCHOOL ? <th>在籍クラス・プラン</th> : <th>メール</th>}<th>電話</th>{!SCHOOL && <th>プラン</th>}<th>ステータス</th><th>入会日</th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="font-mono">{String(m.memberNo).padStart(6, "0")}</td>
                  <td><Link href={`/members/${m.id}`} className="font-medium text-brand-700 hover:underline">{m.lastName} {m.firstName}</Link>
                    {m.lastKana && <span className="ml-2 text-xs text-slate-400">{m.lastKana} {m.firstKana}</span>}
                    {SCHOOL && gradeLabel(m.birthDate) && <span className="ml-1 text-xs text-slate-500">{gradeLabel(m.birthDate)}</span>}
                    {m.guardian && <span className="block text-xs text-slate-500">保護者：{m.guardian.lastName} {m.guardian.firstName}</span>}</td>
                  {SCHOOL ? (
                    <td className="!whitespace-normal text-xs">
                      {m.enrollments.length === 0 ? <span className="text-slate-400">在籍なし</span> : m.enrollments.map((e) => (
                        <span key={e.id} className="block">{e.schoolClass ? `${WEEKDAYS[e.schoolClass.weekday]} ${e.schoolClass.startTime} ${e.schoolClass.name}` : <span className="font-bold text-blue-800">フリー</span>}<span className="ml-1 text-slate-500">{e.plan?.name ?? ""}</span></span>
                      ))}
                    </td>
                  ) : <td>{m.email ?? "-"}</td>}
                  <td>{m.phone ?? "-"}</td>
                  {!SCHOOL && <td>{m.plan?.name ?? "-"}</td>}
                  <td><Badge tone={m.status === "ACTIVE" ? "green" : m.status === "SUSPENDED" ? "yellow" : "gray"}>{MEMBER_STATUS[m.status]}</Badge></td>
                  <td>{fmtDate(m.joinedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pager page={page} total={total} perPage={PER} base={`/members?${qs}`} />
      </div>
    </>
  );
}
