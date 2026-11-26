// Static site generator: data/ + content/ -> dist/
// Usage: node build.mjs [--drafts]   (--drafts = 下書きも出力するプレビュー用。公開には使わない)
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadAll, validate } from "./lib/load.mjs";
import { esc, renderMarkdown } from "./lib/md.mjs";

const withDrafts = process.argv.includes("--drafts");
const data = loadAll();
const { site, programs, byId } = data;
const errors = validate(data);
if (errors.length && !withDrafts) {
  console.error("公開できない問題があります:\n- " + errors.join("\n- "));
  process.exit(1);
}
const articles = data.articles.filter((a) => a.status === "published" || withDrafts);
const OUT = path.join(ROOT, "dist");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(ROOT, "public"), OUT, { recursive: true });

const base = site.url.replace(/\/$/, "");
const adLink = (p, text, cls = "") =>
  p.affiliateUrl
    ? `<a class="${cls}" href="${esc(p.affiliateUrl)}" rel="sponsored nofollow noopener" target="_blank">${esc(text)}</a>${p.impressionPixel ? `<img src="${esc(p.impressionPixel)}" width="1" height="1" alt="" loading="lazy">` : ""}`
    : `<span class="${cls} missing">[リンク未設定: ${esc(p.id)}]</span>`;

function cta(p) {
  return `<aside class="cta">
  <div class="cta-head"><span class="pr">PR</span><strong>${esc(p.name)}</strong></div>
  <dl><dt>体験</dt><dd>${esc(p.trial)}</dd><dt>料金</dt><dd>${esc(p.price)}</dd><dt>エリア</dt><dd>${esc((p.areas || []).join("・"))}</dd></dl>
  ${p.pros?.length ? `<ul class="pros">${p.pros.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
  ${p.cons?.length ? `<ul class="cons">${p.cons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
  ${adLink(p, `${p.name}の${p.rewardType === "会員登録" ? "登録" : "体験"}ページを見る（公式）`, "btn")}
  <p class="verified">情報確認日: ${esc(p.lastVerified)}（最新情報は公式サイトでご確認ください）</p>
</aside>`;
}

function table(category) {
  const rows = programs.filter((p) => p.category === category && (p.active || withDrafts));
  if (!rows.length) return withDrafts ? `<p class="missing">[比較表: ${esc(category)} の案件なし]</p>` : "";
  return `<div class="tbl"><table><thead><tr><th>サービス</th><th>体験</th><th>料金</th><th>エリア</th><th></th></tr></thead><tbody>${rows
    .map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.trial)}</td><td>${esc(p.price)}</td><td>${esc((p.areas || []).join("・"))}</td><td>${adLink(p, "公式", "btn-sm")}</td></tr>`)
    .join("")}</tbody></table><p class="note"><span class="pr">PR</span> 表内のリンクは広告です。</p></div>`;
}

const shortcode = (name, arg) => {
  if (name === "cta") { const p = byId.get(arg); return p ? cta(p) : `<p class="missing">[案件なし: ${esc(arg)}]</p>`; }
  if (name === "table") return table(arg);
  return `<p class="missing">[不明なショートコード: ${esc(name)}]</p>`;
};

const layout = ({ title, description, canonical, body, hasAds }) => `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}"><link rel="stylesheet" href="/style.css">
${withDrafts ? '<meta name="robots" content="noindex">' : ""}
</head><body>
<header class="site"><a href="/" class="logo">${esc(site.name)}</a></header>
${hasAds ? '<p class="disclosure">本ページはプロモーション（広告）を含みます。</p>' : ""}
<main>${body}</main>
<footer class="site"><a href="/about/">運営者情報・広告ポリシー</a><span>© ${esc(site.name)}</span></footer>
</body></html>`;

const write = (rel, html) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); };

for (const a of articles) {
  const html = renderMarkdown(a.body, shortcode);
  write(`${a.slug}/index.html`, layout({
    title: `${a.title}｜${site.name}`, description: a.description, canonical: `${base}/${a.slug}/`,
    hasAds: /\{\{(cta|table):/.test(a.body),
    body: `<article><p class="meta">${esc(a.category || "")}${a.updated ? ` ・ 更新日 ${esc(a.updated)}` : ""}${a.status !== "published" ? ' ・ <span class="missing">下書き</span>' : ""}</p><h1>${esc(a.title)}</h1>${html}</article>`,
  }));
}

const cats = [...new Set(articles.map((a) => a.category || "その他"))];
write("index.html", layout({
  title: site.name, description: site.tagline, canonical: `${base}/`, hasAds: false,
  body: `<h1>${esc(site.name)}</h1><p>${esc(site.tagline)}</p>${cats.map((c) => `<h2>${esc(c)}</h2><ul class="list">${articles
    .filter((a) => (a.category || "その他") === c)
    .map((a) => `<li><a href="/${a.slug}/">${esc(a.title)}</a></li>`).join("")}</ul>`).join("") || "<p>記事は準備中です。</p>"}`,
}));

write("about/index.html", layout({
  title: `運営者情報・広告ポリシー｜${site.name}`, description: `${site.name}の運営者情報と広告掲載ポリシー`, canonical: `${base}/about/`, hasAds: false,
  body: `<h1>運営者情報・広告ポリシー</h1><h2>運営者</h2><p>${esc(site.operator)}</p><p>${esc(site.operatorProfile)}</p><p>お問い合わせ: ${esc(site.contact)}</p>
<h2>広告について</h2><p>当サイトはA8.netなどのアフィリエイトプログラムに参加しており、記事内のリンクから申込み・登録があった場合に運営者が報酬を受け取ることがあります。広告を含むページには「PR」「プロモーションを含みます」と表示しています。報酬の有無によって評価を変えることはありません。</p>
<h2>情報の正確性</h2><p>料金・キャンペーン等は各記事に記載の確認日時点の情報です。最新情報は必ず公式サイトでご確認ください。</p>
<h2>アクセス解析・Cookie</h2><p>アフィリエイトの成果確認のため、広告配信事業者がCookieを使用する場合があります。</p>`,
}));

write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${["", "about/", ...articles.map((a) => `${a.slug}/`)]
  .map((p) => `  <url><loc>${esc(`${base}/${p}`)}</loc></url>`).join("\n")}\n</urlset>\n`);
write("robots.txt", withDrafts ? "User-agent: *\nDisallow: /\n" : `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);

console.log(`built ${articles.length} article(s) -> dist/${withDrafts ? "  (drafts included, noindex)" : ""}`);
