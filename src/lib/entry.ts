import type { EntryFormat, EventCategory } from "@prisma/client";

export const FORMAT_LABEL: Record<EntryFormat, string> = { SINGLES: "シングルス", DOUBLES: "ダブルス", TEAM: "団体戦" };

export function categoryLabel(c: Pick<EventCategory, "name" | "level">) {
  return c.level ? `${c.name}（${c.level}）` : c.name;
}

/** 1エントリーの人数 */
export function entrySize(c: Pick<EventCategory, "format" | "teamSize">) {
  return c.format === "SINGLES" ? 1 : c.format === "DOUBLES" ? 2 : Math.max(2, c.teamSize);
}

/** 一覧などに出すエントリー名（チーム名、またはペアの名前） */
export function entryName(r: { teamName: string | null; players: string[] }, fallback = "") {
  if (r.teamName) return r.teamName;
  if (r.players.length) return r.players.join(" / ");
  return fallback;
}

const clean = (v: FormDataEntryValue | null) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 30);

/** フォームからエントリー内容を読み取る。representative は代表者（申込者）の名前 */
export function parseEntry(
  c: Pick<EventCategory, "format" | "teamSize">,
  fd: FormData,
  representative: string,
): { ok: true; teamName: string | null; players: string[] } | { ok: false; error: string } {
  if (c.format === "SINGLES") return { ok: true, teamName: null, players: [representative] };
  if (c.format === "DOUBLES") {
    const partner = clean(fd.get("partner"));
    if (!partner) return { ok: false, error: "パートナーの名前を入力してください" };
    return { ok: true, teamName: null, players: [representative, partner] };
  }
  const teamName = clean(fd.get("teamName"));
  if (!teamName) return { ok: false, error: "チーム名を入力してください" };
  const others: string[] = [];
  for (let i = 2; i <= entrySize(c); i++) {
    const n = clean(fd.get(`player${i}`));
    if (!n) return { ok: false, error: `メンバー${i}の名前を入力してください` };
    others.push(n);
  }
  return { ok: true, teamName, players: [representative, ...others] };
}
