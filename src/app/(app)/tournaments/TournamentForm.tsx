import type { Tournament } from "@prisma/client";
import { ActionForm, Submit } from "@/components/ActionForm";
import { jstDateKey } from "@/lib/format";
import { saveTournament } from "./actions";

export function TournamentForm({ t }: { t?: Tournament }) {
  return (
    <ActionForm action={saveTournament} className="space-y-3">
      {t && <input type="hidden" name="id" value={t.id} />}
      <label className="block"><span className="label">大会名</span><input className="input" name="name" required defaultValue={t?.name} placeholder="山口県ダブルス選手権" /></label>
      <label className="block"><span className="label">主催</span><input className="input" name="organizer" defaultValue={t?.organizer ?? "山口県テニス協会"} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="label">開催日</span><input className="input" type="date" name="date" required defaultValue={t ? jstDateKey(t.date) : ""} /></label>
        <label className="block"><span className="label">スクール内の締切</span><input className="input" type="date" name="entryDeadline" defaultValue={t?.entryDeadline ? jstDateKey(t.entryDeadline) : ""} /></label>
        <label className="block"><span className="label">会場</span><input className="input" name="venue" defaultValue={t?.venue ?? ""} /></label>
        <label className="block"><span className="label">参加費（1エントリー）</span><input className="input" type="number" min={0} name="fee" defaultValue={t?.fee ?? 0} /></label>
      </div>
      <label className="block"><span className="label">種目（1行に1つ）</span><textarea className="input" name="categories" rows={4} required defaultValue={t?.categories.join("\n") ?? ""} placeholder={"一般男子ダブルス\n一般女子ダブルス\n35歳以上 男子シングルス"} /></label>
      <label className="block"><span className="label">案内（会員ページに表示）</span><textarea className="input" name="description" rows={3} defaultValue={t?.description ?? ""} placeholder="要項のURL、集合時間、持ち物など" /></label>
      {t && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={t.published} />会員ページで申込みを受け付ける</label>}
      <Submit>{t ? "保存" : "大会を登録"}</Submit>
    </ActionForm>
  );
}
