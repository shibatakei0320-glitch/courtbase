// Claude で記事の「下書き」を作る。公開は人が確認して status: published に変えたときだけ。
// 使い方: npm run draft -- --slug pickleball-paddle --keyword "ピックルボール パドル 初心者" --programs id1,id2 [--notes "現場で感じたこと"]
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { ROOT, loadAll } from "../lib/load.mjs";

const { values: args } = parseArgs({ options: {
  slug: { type: "string" }, keyword: { type: "string" }, programs: { type: "string", default: "" },
  notes: { type: "string", default: "" }, category: { type: "string", default: "" },
} });
if (!args.slug || !args.keyword || !/^[a-z0-9-]+$/.test(args.slug)) {
  console.error('必須: --slug (半角英小文字・数字・ハイフン) --keyword "狙う検索キーワード"');
  process.exit(1);
}
const file = path.join(ROOT, "content", `${args.slug}.md`);
if (fs.existsSync(file)) { console.error(`${file} は既にあります`); process.exit(1); }

const { site, byId } = loadAll();
const ids = args.programs.split(",").map((s) => s.trim()).filter(Boolean);
const progs = ids.map((id) => { const p = byId.get(id); if (!p) { console.error(`案件 ${id} が programs.json にありません`); process.exit(1); } return p; });
const facts = progs.map(({ rewardMemo, affiliateUrl, impressionPixel, ...p }) => p); // 報酬額やリンクはモデルに渡さない

const system = `あなたは日本語のフィットネス系情報サイト「${site.name}」の編集者です。運営者: ${site.operatorProfile}
読者は「${args.keyword}」で検索した初心者です。読者の疑問に正面から答える、具体的で誇張のない記事の下書きを書きます。

厳守事項:
- サービスの料金・特典・キャンペーン・実績など事実に関わる記述は、渡された案件データに書かれている内容だけを使う。データにない事実は書かず「【要確認】」と書く。
- 薬機法・健康増進法・景品表示法に抵触する表現を使わない: 「痩せる」「治る」「効く」「脂肪燃焼」など効果効能の断定、「絶対」「必ず」「最安」「No.1」「今だけ」など根拠のない断定や優良・有利誤認。体の変化は「〜を目指せる」「個人差があります」の範囲で書く。
- サプリメント・食品は効果効能を一切書かず、成分・価格・味・続けやすさなど事実と使用感の範囲に留める。
- 運営者は匿名。地名・店舗名・人物を特定できる体験談を作らない。
- 運営者の実体験が入るべき箇所には「【体験談を追記】」と書き、何を書けばよいかを一行で示す（体験談を創作しない）。
- 案件を紹介する位置に、その行だけで {{cta:案件ID}} と書く。複数案件を比べる箇所には {{table:カテゴリ名}} と書く。使える案件IDとカテゴリはデータにあるものだけ。
- 本文は Markdown（## 見出し、- 箇条書き、**強調**）。h1 は書かない。2,500〜4,000字程度。`;

const user = `狙うキーワード: ${args.keyword}
運営者メモ: ${args.notes || "（なし）"}
案件データ(JSON):
${JSON.stringify(facts, null, 2)}`;

const client = new Anthropic();
const res = await client.beta.messages.create({
  model: "claude-opus-5-5",
  max_tokens: 16000,
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
  output_config: {
    effort: "high",
    format: { type: "json_schema", schema: {
      type: "object", additionalProperties: false, required: ["title", "description", "body"],
      properties: {
        title: { type: "string", description: "32字前後の記事タイトル。キーワードを自然に含める" },
        description: { type: "string", description: "120字以内のメタディスクリプション" },
        body: { type: "string", description: "Markdown 本文" },
      },
    } },
  },
  system,
  messages: [{ role: "user", content: user }],
});

if (res.stop_reason === "refusal") { console.error("生成が拒否されました:", res.stop_details?.explanation ?? ""); process.exit(1); }
if (res.stop_reason === "max_tokens") { console.error("出力が上限で途切れました。キーワードを絞って再実行してください"); process.exit(1); }
const text = res.content.find((b) => b.type === "text")?.text;
const out = JSON.parse(text);
const oneLine = (s) => s.replace(/\s+/g, " ").trim();
const category = args.category || progs[0]?.category || "";
fs.writeFileSync(file, `---
title: ${oneLine(out.title)}
description: ${oneLine(out.description)}
category: ${category}
programs: ${ids.join(",")}
status: draft
keyword: ${args.keyword}
updated: ${new Date().toISOString().slice(0, 10)}
---

${out.body.trim()}
`);
console.log(`下書きを作成: content/${args.slug}.md`);
console.log("→【要確認】【体験談を追記】を埋め、内容を確認してから status: published に変更してください。");
