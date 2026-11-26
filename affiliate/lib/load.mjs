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
export function validate({ programs, byId, articles }) {
  const errors = [];
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
    const refs = [...a.body.matchAll(/\{\{cta:([^}]+)\}\}/g)].map((m) => m[1].trim()).concat(a.programs);
    for (const id of refs) {
      const p = byId.get(id);
      if (!p) errors.push(`${a.file}: 存在しない案件 "${id}" を参照しています`);
      else if (!p.active) errors.push(`${a.file}: 停止中の案件 "${id}" を参照しています（案件終了なら記事から外してください）`);
    }
  }
  return errors;
}
