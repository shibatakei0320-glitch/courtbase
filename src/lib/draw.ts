// 対戦表（リーグ戦・トーナメント）の作成と集計

export type DrawMatch = {
  stage: "LEAGUE" | "KNOCKOUT";
  groupName: string | null;
  round: number;
  position: number;
  entryAId: string | null;
  entryBId: string | null;
  key: string; // 生成時の仮キー（next の参照用）
  nextKey?: string;
  nextSlot?: number;
  winnerId?: string | null;
};

export function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

const GROUP_NAMES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** リーグ戦。グループに蛇行配置し、各グループを総当たり（サークル方式で回戦を割り当て） */
export function league(entryIds: string[], groups: number): DrawMatch[] {
  const g = Math.max(1, Math.min(groups, Math.floor(entryIds.length / 2) || 1));
  const buckets: string[][] = Array.from({ length: g }, () => []);
  entryIds.forEach((id, i) => {
    const row = Math.floor(i / g);
    const col = row % 2 === 0 ? i % g : g - 1 - (i % g);
    buckets[col].push(id);
  });
  const out: DrawMatch[] = [];
  buckets.forEach((ids, gi) => {
    const list: (string | null)[] = [...ids];
    if (list.length % 2) list.push(null);
    const n = list.length;
    let pos = 0;
    for (let r = 0; r < n - 1; r++) {
      for (let i = 0; i < n / 2; i++) {
        const a = list[i], b = list[n - 1 - i];
        if (a && b) out.push({ stage: "LEAGUE", groupName: GROUP_NAMES[gi], round: r + 1, position: pos++, entryAId: a, entryBId: b, key: `L${gi}-${pos}` });
      }
      list.splice(1, 0, list.pop()!); // 先頭を固定して回転
    }
  });
  return out;
}

/** シード順の並び（1 vs 最下位…が離れるように） */
function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

/** トーナメント。2のべき乗に満たない分は不戦勝（BYE） */
export function knockout(entryIds: string[]): DrawMatch[] {
  const n = entryIds.length;
  if (n < 2) return [];
  let size = 1;
  while (size < n) size *= 2;
  const rounds = Math.log2(size);
  const order = seedOrder(size); // seed番号（1始まり）
  const slots = order.map((seed) => (seed <= n ? entryIds[seed - 1] : null));
  const out: DrawMatch[] = [];
  for (let r = 1; r <= rounds; r++) {
    const count = size / 2 ** r;
    for (let p = 0; p < count; p++) {
      const m: DrawMatch = { stage: "KNOCKOUT", groupName: null, round: r, position: p, entryAId: null, entryBId: null, key: `K${r}-${p}` };
      if (r < rounds) {
        m.nextKey = `K${r + 1}-${Math.floor(p / 2)}`;
        m.nextSlot = p % 2;
      }
      if (r === 1) {
        m.entryAId = slots[p * 2];
        m.entryBId = slots[p * 2 + 1];
      }
      out.push(m);
    }
  }
  // 1回戦の不戦勝を次の試合へ進める
  const byKey = new Map(out.map((m) => [m.key, m]));
  for (const m of out.filter((x) => x.round === 1)) {
    const only = m.entryAId && !m.entryBId ? m.entryAId : !m.entryAId && m.entryBId ? m.entryBId : null;
    if (only) {
      m.winnerId = only;
      const next = m.nextKey ? byKey.get(m.nextKey) : undefined;
      if (next) {
        if (m.nextSlot === 0) next.entryAId = only;
        else next.entryBId = only;
      }
    }
  }
  return out;
}

export function roundLabel(round: number, totalRounds: number) {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "決勝";
  if (fromEnd === 1) return "準決勝";
  if (fromEnd === 2) return "準々決勝";
  return `${round}回戦`;
}

/** "11-7, 9-11, 11-5" → セットごとの得点 */
export function parseScore(score: string | null | undefined): [number, number][] {
  if (!score) return [];
  return [...score.matchAll(/(\d+)\s*[-－–:：]\s*(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

export type Standing = { id: string; played: number; wins: number; losses: number; setDiff: number; pointDiff: number };

/** リーグ戦の順位表（勝数 → セット差 → 得失点差） */
export function standings(entryIds: string[], matches: { entryAId: string | null; entryBId: string | null; winnerId: string | null; score: string | null }[]): Standing[] {
  const t = new Map(entryIds.map((id) => [id, { id, played: 0, wins: 0, losses: 0, setDiff: 0, pointDiff: 0 }]));
  for (const m of matches) {
    if (!m.winnerId || !m.entryAId || !m.entryBId) continue;
    const a = t.get(m.entryAId), b = t.get(m.entryBId);
    if (!a || !b) continue;
    a.played++; b.played++;
    if (m.winnerId === m.entryAId) { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
    for (const [x, y] of parseScore(m.score)) {
      a.pointDiff += x - y; b.pointDiff += y - x;
      if (x > y) { a.setDiff++; b.setDiff--; } else if (y > x) { b.setDiff++; a.setDiff--; }
    }
  }
  return [...t.values()].sort((p, q) => q.wins - p.wins || q.setDiff - p.setDiff || q.pointDiff - p.pointDiff);
}
