"use client";
import { useMemo, useState } from "react";
import { importMembers } from "./actions";
import { FIELDS, type Field, type ImportResult, type ImportRow } from "./types";

type Target = Field | "";

/** CSV（RFC4180相当）をパース */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** 見出しから取り込み先を推測 */
function guess(header: string): Target {
  const h = header.replace(/[\s　（）()\[\]【】・_\-]/g, "").toLowerCase();
  if (/(会員|メンバー|顧客|member|customer)(id|番号|no|コード)/.test(h)) return "externalId";
  if (/^(セイ|姓カナ|姓フリガナ|フリガナ姓|せい|姓ふりがな)$/.test(h) || /^(姓|氏)(カナ|フリガナ)/.test(h)) return "lastKana";
  if (/^(メイ|名カナ|名フリガナ|フリガナ名|めい|名ふりがな)$/.test(h)) return "firstKana";
  if (/フリガナ|ふりがな|カナ|kana/.test(h)) return "fullKana";
  if (/^(姓|氏|苗字|lastname|familyname)$/.test(h)) return "lastName";
  if (/^(名|firstname|givenname)$/.test(h)) return "firstName";
  if (/氏名|名前|お名前|会員名|name/.test(h)) return "fullName";
  if (/mail|メール/.test(h)) return "email";
  if (/電話|携帯|tel|phone/.test(h)) return "phone";
  if (/生年月日|誕生日|birth/.test(h)) return "birthDate";
  if (/性別|gender|sex/.test(h)) return "gender";
  if (/ステータス|状態|在籍|status/.test(h)) return "status";
  if (/入会日|入会年月日|登録日|joined/.test(h)) return "joinedAt";
  if (/住所|郵便|プラン|契約|備考|メモ|コース|所属|レベル/.test(h)) return "note";
  return "";
}

async function decode(file: File) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("shift_jis").decode(buf);
  }
}

const CHUNK = 200;

export function Importer() {
  const [name, setName] = useState("");
  const [header, setHeader] = useState<string[]>([]);
  const [data, setData] = useState<string[][]>([]);
  const [map, setMap] = useState<Target[]>([]);
  const [mode, setMode] = useState<"skip" | "update">("skip");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(f: File | undefined) {
    setResult(null); setError(null);
    if (!f) return;
    const rows = parseCsv(await decode(f));
    if (rows.length < 2) { setError("データの行が見つかりません。1行目が見出しのCSVを選んでください。"); return; }
    setName(f.name);
    setHeader(rows[0].map((h) => h.trim()));
    setData(rows.slice(1));
    setMap(rows[0].map((h) => guess(h)));
  }

  const toRows = useMemo(() => () => data.map((r) => {
    const o: ImportRow = {};
    const notes: string[] = [];
    map.forEach((f, i) => {
      const v = (r[i] ?? "").trim();
      if (!f || !v) return;
      if (f === "note") notes.push(`${header[i]}: ${v}`);
      else if (!o[f]) o[f] = v;
    });
    if (notes.length) o.note = notes.join("\n");
    return o;
  }), [data, map, header]);

  const hasName = map.includes("fullName") || map.includes("lastName");

  async function run() {
    setBusy(true); setError(null); setProgress(0);
    const rows = toRows();
    const total: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const r = await importMembers(rows.slice(i, i + CHUNK), mode, i);
        total.created += r.created; total.updated += r.updated; total.skipped += r.skipped; total.errors.push(...r.errors);
        setProgress(Math.min(rows.length, i + CHUNK));
      }
      setResult(total);
    } catch {
      setError("取り込みの途中でエラーが起きました。取り込み済みの分はそのまま残っています。もう一度実行すると、取り込み済みの会員は重複せずスキップされます。");
      setResult(total);
    } finally {
      setBusy(false);
    }
  }

  const preview = toRows().slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <h2 className="mb-2 font-semibold">1. CSVファイルを選ぶ</h2>
        <p className="mb-3 text-sm text-slate-600">1行目が見出しのCSV（UTF-8 / Shift_JIS）を読み込めます。hacomono の会員一覧のCSV出力をそのまま使えます。</p>
        <input type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} className="block text-sm" />
        {name && <p className="mt-2 text-sm text-slate-600">{name}：{data.length}件</p>}
        {error && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>

      {header.length > 0 && !result && (
        <>
          <div className="card overflow-x-auto">
            <h2 className="border-b px-4 py-3 font-semibold">2. 列の割り当てを確認</h2>
            <table className="table">
              <thead><tr><th>CSVの列</th><th>例</th><th>取り込み先</th></tr></thead>
              <tbody>
                {header.map((h, i) => (
                  <tr key={i}>
                    <td className="font-medium">{h || `(${i + 1}列目)`}</td>
                    <td className="max-w-xs truncate text-slate-500">{data.find((r) => r[i]?.trim())?.[i] ?? ""}</td>
                    <td>
                      <select className="input" value={map[i]} onChange={(e) => setMap((m) => m.map((x, j) => (j === i ? (e.target.value as Target) : x)))}>
                        <option value="">取り込まない</option>
                        {Object.entries(FIELDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!hasName && <p className="px-4 py-3 text-sm text-red-700">「氏名」または「姓」の列を割り当ててください。</p>}
          </div>

          <div className="card overflow-x-auto">
            <h2 className="border-b px-4 py-3 font-semibold">3. 取り込み内容のプレビュー（先頭5件）</h2>
            <table className="table">
              <thead><tr><th>氏名</th><th>フリガナ</th><th>メール</th><th>電話</th><th>生年月日</th><th>ステータス</th><th>メモ</th></tr></thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td>{r.fullName ?? [r.lastName, r.firstName].filter(Boolean).join(" ")}</td>
                    <td>{r.fullKana ?? [r.lastKana, r.firstKana].filter(Boolean).join(" ")}</td>
                    <td>{r.email}</td><td>{r.phone}</td><td>{r.birthDate}</td><td>{r.status}</td>
                    <td className="max-w-xs whitespace-pre-line text-xs text-slate-500">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card space-y-3 p-5">
            <h2 className="font-semibold">4. 取り込む</h2>
            <p className="text-sm text-slate-600">すでに登録されている会員（移行元の会員ID・メール・電話番号＋姓が一致）がいた場合：</p>
            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={mode === "skip"} onChange={() => setMode("skip")} />取り込まない（スキップ）</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={mode === "update"} onChange={() => setMode("update")} />CSVの内容で上書きする（空欄の項目は上書きしない）</label>
            <button className="btn-primary" disabled={busy || !hasName} onClick={run}>
              {busy ? `取り込み中… ${progress}/${data.length}` : `${data.length}件を取り込む`}
            </button>
          </div>
        </>
      )}

      {result && (
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">取り込み結果</h2>
          <p className="text-sm">新規 <b>{result.created}</b> 件／更新 <b>{result.updated}</b> 件／スキップ <b>{result.skipped}</b> 件／エラー <b className={result.errors.length ? "text-red-700" : ""}>{result.errors.length}</b> 件</p>
          {result.errors.length > 0 && (
            <ul className="mt-3 max-h-64 overflow-y-auto text-sm text-red-700">
              {result.errors.map((e, i) => <li key={i}>{e.row}行目：{e.message}</li>)}
            </ul>
          )}
          <a href="/members" className="btn-secondary mt-4 inline-flex">会員一覧へ</a>
        </div>
      )}
    </div>
  );
}
