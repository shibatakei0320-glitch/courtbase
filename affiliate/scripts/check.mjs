// 定期チェック: 公開前の検証 + 広告リンクの死活 + 情報の鮮度
// 問題があれば exit 1（GitHub Actions が失敗 → 通知メールが届く）
import { loadAll, validate } from "../lib/load.mjs";

const data = loadAll();
const problems = validate(data);
const warnings = [];
const today = Date.now();

for (const p of data.programs.filter((p) => p.active)) {
  const age = (today - Date.parse(p.lastVerified)) / 86400000;
  if (!(age <= data.site.staleDays)) warnings.push(`${p.id}: 情報確認日 ${p.lastVerified} から${Math.floor(age)}日経過。公式サイトで料金・体験内容を再確認し lastVerified を更新してください`);
  if (!p.affiliateUrl) continue;
  try {
    const res = await fetch(p.affiliateUrl, { redirect: "follow", signal: AbortSignal.timeout(20000), headers: { "user-agent": "Mozilla/5.0 (link-check)" } });
    const host = new URL(res.url).hostname;
    if (!res.ok) problems.push(`${p.id}: 広告リンクが HTTP ${res.status}（${res.url}）`);
    else if (p.network === "a8" && /(^|\.)a8\.net$/.test(host)) problems.push(`${p.id}: 広告主サイトへ遷移せず A8 に留まっています（提携解除・案件終了の可能性）: ${res.url}`);
    else console.log(`ok  ${p.id} -> ${host}`);
  } catch (e) {
    problems.push(`${p.id}: 広告リンクに接続できません (${e.message})`);
  }
}

for (const w of warnings) console.warn(`WARN ${w}`);
for (const e of problems) console.error(`NG   ${e}`);
console.log(`\n${problems.length} problem(s), ${warnings.length} warning(s)`);
process.exit(problems.length ? 1 : 0);
