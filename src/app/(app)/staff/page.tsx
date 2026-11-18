import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, PageHeader } from "@/components/ui";
import { ROLE_LABEL, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { createStaff, forceLogout, resetStaffPassword, updateStaff } from "./actions";

export const metadata = { title: "スタッフ" };

export default async function StaffPage() {
  const me = await requireStaff(["OWNER", "ADMIN"]);
  const staff = await db.staff.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { sessions: { where: { expiresAt: { gt: new Date() } } } } } },
  });
  const roles = me.role === "OWNER" ? (["OWNER", "ADMIN", "STAFF"] as const) : (["ADMIN", "STAFF"] as const);
  return (
    <>
      <PageHeader title="スタッフ" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {staff.map((s) => {
            const locked = s.lockedUntil && s.lockedUntil > new Date();
            const editable = me.role === "OWNER" || s.role !== "OWNER";
            return (
              <div key={s.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-sm text-slate-500">{s.email}</span>
                  <Badge tone={s.role === "OWNER" ? "blue" : "gray"}>{ROLE_LABEL[s.role]}</Badge>
                  {!s.active && <Badge tone="red">無効</Badge>}
                  {locked && <Badge tone="yellow">ロック中</Badge>}
                  {s.mustChangePassword && <Badge tone="yellow">PW変更待ち</Badge>}
                  {s.id === me.id && <Badge tone="green">あなた</Badge>}
                </div>
                <p className="mt-1 text-xs text-slate-400">最終ログイン {fmtDateTime(s.lastLoginAt)} ／ PW変更 {fmtDateTime(s.passwordChangedAt)} ／ 有効セッション {s._count.sessions}</p>
                {editable && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-brand-700">編集・操作</summary>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      <ActionForm action={updateStaff} className="space-y-2">
                        <input type="hidden" name="id" value={s.id} />
                        <label className="block"><span className="label">氏名</span><input className="input" name="name" defaultValue={s.name} /></label>
                        <label className="block"><span className="label">権限</span>
                          <select className="input" name="role" defaultValue={s.role}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
                        </label>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={s.active} />有効</label>
                        <Submit className="btn-primary btn-sm">保存</Submit>
                      </ActionForm>
                      {s.id !== me.id && (
                        <div className="space-y-3">
                          <ActionForm action={resetStaffPassword} confirm={`${s.name} のパスワードをリセットしますか？`}>
                            <input type="hidden" name="id" value={s.id} />
                            <Submit className="btn-secondary btn-sm">仮パスワードを発行</Submit>
                          </ActionForm>
                          <ActionForm action={forceLogout}>
                            <input type="hidden" name="id" value={s.id} />
                            <Submit className="btn-secondary btn-sm">全端末からログアウト</Submit>
                          </ActionForm>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
        <div className="card h-fit p-5">
          <h2 className="mb-3 font-semibold">スタッフ追加</h2>
          <ActionForm action={createStaff} className="space-y-3" resetOnSuccess>
            <label className="block"><span className="label">氏名</span><input className="input" name="name" required /></label>
            <label className="block"><span className="label">メールアドレス（ログインID）</span><input className="input" type="email" name="email" required /></label>
            <label className="block"><span className="label">権限</span>
              <select className="input" name="role" defaultValue="STAFF">{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
            </label>
            <Submit>追加して仮パスワード発行</Submit>
          </ActionForm>
          <dl className="mt-5 space-y-1 text-xs text-slate-500">
            <dt className="font-semibold">権限について</dt>
            <dd>オーナー: 全機能＋施設設定</dd>
            <dd>管理者: マスタ・スタッフ・操作ログ</dd>
            <dd>スタッフ: 会員・予約・入金の日常業務</dd>
          </dl>
        </div>
      </div>
    </>
  );
}
