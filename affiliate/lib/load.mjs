import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontMatter } from "./md.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

export function loadAll() {
  const site = readJson("data/site.json");
  const programs = readJson("data/programs.json");
  const byId = new Map(programs.map((p) => [p.id, p]));
  const dir = path.join(ROOT, "content");
  const articles = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => {
    const { meta, body } = parseFrontMatter(fs.readFileSync(path.join(dir, f), "utf8"));
    return { slug: f.replace(/\.md$/, ""), file: `content/${f}`, ...meta, body };
  });
  return { site, programs, byId, articles };
}

// Problems that must block publishing. Returns a list of messages.
export const PLACEHOLDER = /【要確認】|【体験談を追記】/;

// 薬機法・健康増進法・景品表示法で問題になりやすい表現（公開記事・案件データに含まれていたらビルド停止）
export const NG_WORDS = [
  "絶対", "必ず", "確実に", "100%", "誰でも痩せ", "飲むだけで", "食べるだけで", "塗るだけで", "寝るだけで",
  "治る", "治す", "完治", "効く", "効果抜群", "副作用なし", "副作用がない",
  "脂肪燃焼", "脂肪を落とす", "デトックス", "若返", "アンチエイジング", "免疫力アップ", "血糖値を下げ", "血圧を下げ",
  "最安", "日本一", "業界No", "No.1", "No1", "ナンバーワン", "業界初", "今だけ",
];
const ngHits = (text) => NG_WORDS.filter((w) => text.includes(w));

// 匿名運営用: 本名・施設名・地名などを PRIVATE_WORDS（カンマ区切り）か private-words.txt（1行1語、git管理外）に書くと
// それがサイトのどこかに含まれた時点でビルドを止める
function privateWords() {
  const fromEnv = (process.env.PRIVATE_WORDS || "").split(",");
  const f = path.join(ROOT, "private-words.txt");
  const fromFile = fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/) : [];
  return [...fromEnv, ...fromFile].map((w) => w.trim()).filter((w) => w && !w.startsWith("#"));
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

export function validate({ site, programs, byId, articles }) {
  const errors = [];
  // --- 匿名性 ---
  const secret = privateWords();
  const texts = [["data/site.json", JSON.stringify(site)], ["data/programs.json", JSON.stringify(programs)],
    ...articles.map((a) => [a.file, JSON.stringify(a)])];
  for (const file of walk(path.join(ROOT, "public"))) {
    const rel = path.relative(ROOT, file);
    const buf = fs.readFileSync(file);
    if (/\.(jpe?g|tiff?|heic)$/i.test(file) && buf.includes(Buffer.from("Exif"))) errors.push(`${rel}: 画像に撮影情報(Exif/GPS)が残っています。書き出し直すか Exif を削除してください`);
    if (/\.(css|html|txt|svg|js|json|xml)$/i.test(file)) texts.push([rel, buf.toString("utf8")]);
  }
  for (const [file, text] of texts) for (const w of secret) if (text.includes(w)) errors.push(`${file}: 公開NGワード「${w}」が含まれています（匿名性）`);
  if (/@/.test(site.contact || "")) errors.push("data/site.json: contact にメールアドレスがあります。匿名運営では問い合わせフォームのURLにしてください");
  // --- 表現規制 ---
  for (const p of programs.filter((p) => p.active)) {
    const { rewardMemo, affiliateUrl, impressionPixel, officialUrl, ...shown } = p;
    const hits = ngHits(JSON.stringify(shown));
    if (hits.length) errors.push(`${p.id}: 規制リスクのある表現「${hits.join("」「")}」があります`);
  }
  for (const a of articles.filter((a) => a.status === "published")) {
    const hits = ngHits(`${a.title}\n${a.description}\n${a.body}`);
    if (hits.length) errors.push(`${a.file}: 規制リスクのある表現「${hits.join("」「")}」があります（言い換えるか削除）`);
  }
  const ids = new Set();
  for (const p of programs) {
    if (ids.has(p.id)) errors.push(`programs.json: id "${p.id}" が重複しています`);
    ids.add(p.id);
    if (p.active) {
      if (!p.affiliateUrl) errors.push(`${p.id}: active なのに affiliateUrl が空です`);
      if (PLACEHOLDER.test(JSON.stringify(p))) errors.push(`${p.id}: active なのに【要確認】が残っています`);
    }
  }
  for (const a of articles.filter((a) => a.status === "published")) {
    if (!a.title || !a.description) errors.push(`${a.file}: title / description がありません`);
    if (PLACEHOLDER.test(a.body)) errors.push(`${a.file}: 公開記事に【要確認】【体験談を追記】が残っています`);
    const refs = new Set([...a.body.matchAll(/\{\{cta:([^}]+)\}\}/g)].map((m) => m[1].trim()).concat(a.programs));
    for (const id of refs) {
      const p = byId.get(id);
      if (!p) errors.push(`${a.file}: 存在しない案件 "${id}" を参照しています`);
      else if (!p.active) errors.push(`${a.file}: 停止中の案件 "${id}" を参照しています（案件終了なら記事から外してください）`);
    }
  }
  return errors;
}
