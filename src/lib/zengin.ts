/*
 * 全銀協フォーマット「預金口座振替 依頼データ／結果データ」（固定長120バイト、半角カナ）
 *
 *   1 ヘッダー   データ区分=1, 種別コード=91, コード区分=0, 委託者コード, 委託者名, 引落日(MMDD), 取引銀行・支店・口座
 *   2 データ     引落銀行・支店, 預金種目, 口座番号, 預金者名, 引落金額, 新規コード, 顧客番号, 振替結果コード
 *   8 トレーラー 合計件数・金額、振替済件数・金額、振替不能件数・金額
 *   9 エンド
 *
 * 文字コードは Shift_JIS（JIS8）。使う文字は半角英数・半角カナ・記号だけなので、1文字＝1バイトで変換できる。
 * ※ 銀行によって細部（改行の有無、使える記号など）が異なることがあるため、最初の1回は銀行にテスト送信して確認すること。
 */

/** 振替結果コード */
export const RESULT_LABEL: Record<string, string> = {
  "0": "振替済",
  "1": "資金不足",
  "2": "預金取引なし",
  "3": "預金者の都合による振替停止",
  "4": "預金口座振替依頼書なし",
  "8": "委託者の都合による振替停止",
  "9": "その他",
};

// ---- 半角カナ変換 ----

const FULL = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンァィゥェォャュョッー";
const HALF = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝｧｨｩｪｫｬｭｮｯｰ";
const DAKU = "ガギグゲゴザジズゼゾダヂヅデドバビブベボ";
const DAKU_BASE = "カキクケコサシスセソタチツテトハヒフヘホ";
const HANDAKU = "パピプペポ";
const HANDAKU_BASE = "ハヒフヘホ";

/**
 * 全角・ひらがなのカナを、口座振替で使える半角カナ（大文字）に変換する。
 * 銀行の規則に合わせ、小さい「ァィゥェォャュョッ」は大きい文字に、長音は「-」に、スペースは半角スペースにする
 */
export function toBankKana(input: string): string {
  let out = "";
  for (const ch0 of input.normalize("NFKC")) {
    let ch = ch0;
    const code = ch.charCodeAt(0);
    if (code >= 0x3041 && code <= 0x3096) ch = String.fromCharCode(code + 0x60); // ひらがな→カタカナ
    if (ch === "ヴ") { out += "ｳﾞ"; continue; }
    let i = DAKU.indexOf(ch);
    if (i >= 0) { out += HALF[FULL.indexOf(DAKU_BASE[i])] + "ﾞ"; continue; }
    i = HANDAKU.indexOf(ch);
    if (i >= 0) { out += HALF[FULL.indexOf(HANDAKU_BASE[i])] + "ﾟ"; continue; }
    i = FULL.indexOf(ch);
    if (i >= 0) { out += HALF[i]; continue; }
    if (ch === "　" || ch === " ") { out += " "; continue; }
    if (/[A-Za-z0-9().,\-/]/.test(ch)) { out += ch.toUpperCase(); continue; }
    if (code >= 0xff61 && code <= 0xff9f) { out += ch; continue; }
    // それ以外（漢字など）は使えない
    out += "?";
  }
  // 小さい文字は大きい文字に（全銀の規則）、長音は「-」
  return out.replace(/ｧ/g, "ｱ").replace(/ｨ/g, "ｲ").replace(/ｩ/g, "ｳ").replace(/ｪ/g, "ｴ").replace(/ｫ/g, "ｵ")
    .replace(/ｬ/g, "ﾔ").replace(/ｭ/g, "ﾕ").replace(/ｮ/g, "ﾖ").replace(/ｯ/g, "ﾂ").replace(/ｰ/g, "-");
}

/** 半角カナとして使えない文字が残っていないか */
export const isBankKana = (s: string) => !s.includes("?") && [...s].every((c) => c.charCodeAt(0) < 0x80 || (c.charCodeAt(0) >= 0xff61 && c.charCodeAt(0) <= 0xff9f));

// ---- 固定長の組み立て ----

const X = (s: string | null | undefined, n: number) => {
  const t = [...(s ?? "")].slice(0, n).join("");
  return t + " ".repeat(n - [...t].length);
};
const N = (v: string | number | null | undefined, n: number) => {
  const t = String(v ?? "").replace(/\D/g, "").slice(-n);
  return t.padStart(n, "0");
};

export type Consignor = { code: string; name: string; day: string /* MMDD */; bankCode: string; bankName: string; branchCode: string; branchName: string; accountType: number; accountNo: string };
export type DebitRow = { bankCode: string; bankName: string; branchCode: string; branchName: string; accountType: number; accountNo: string; holder: string; amount: number; isNew: boolean; customerNo: string };

export function buildRequest(c: Consignor, rows: DebitRow[]): string[] {
  const lines: string[] = [];
  lines.push("1" + "91" + "0" + N(c.code, 10) + X(c.name, 40) + N(c.day, 4) + N(c.bankCode, 4) + X(c.bankName, 15) + N(c.branchCode, 3) + X(c.branchName, 15) + N(c.accountType, 1) + N(c.accountNo, 7) + X("", 17));
  for (const r of rows) {
    lines.push("2" + N(r.bankCode, 4) + X(r.bankName, 15) + N(r.branchCode, 3) + X(r.branchName, 15) + X("", 4) + N(r.accountType, 1) + N(r.accountNo, 7) + X(r.holder, 30) + N(r.amount, 10) + (r.isNew ? "1" : "0") + X(r.customerNo, 20) + "0" + X("", 8));
  }
  const total = rows.reduce((a, r) => a + r.amount, 0);
  lines.push("8" + N(rows.length, 6) + N(total, 12) + N(0, 6) + N(0, 12) + N(0, 6) + N(0, 12) + X("", 65));
  lines.push("9" + X("", 119));
  for (const l of lines) if ([...l].length !== 120) throw new Error(`レコード長が120バイトではありません（${[...l].length}）`);
  return lines;
}

/** 文字列（半角のみ）→ Shift_JIS のバイト列。半角カナは 0xA1–0xDF */
export function toSjis(lines: string[], newline = "\r\n"): Uint8Array {
  const text = lines.join(newline) + newline;
  const out = new Uint8Array([...text].length);
  let i = 0;
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c < 0x80) out[i++] = c;
    else if (c >= 0xff61 && c <= 0xff9f) out[i++] = c - 0xff61 + 0xa1;
    else throw new Error(`半角に変換できない文字があります：${ch}`);
  }
  return out;
}

/** Shift_JIS の結果ファイル（半角のみ）→ 120文字ずつのレコード。改行あり・なしの両方に対応 */
export function parseResult(bytes: Uint8Array) {
  let text = "";
  for (const b of bytes) {
    if (b === 0x0d || b === 0x0a) continue;
    text += b < 0x80 ? String.fromCharCode(b) : b >= 0xa1 && b <= 0xdf ? String.fromCharCode(b - 0xa1 + 0xff61) : "?";
  }
  const records: string[] = [];
  for (let i = 0; i + 120 <= text.length; i += 120) records.push(text.slice(i, i + 120));
  const header = records.find((r) => r[0] === "1");
  const data = records
    .filter((r) => r[0] === "2")
    .map((r) => ({
      bankCode: r.slice(1, 5),
      branchCode: r.slice(20, 23),
      accountNo: r.slice(43, 50),
      holder: r.slice(50, 80).trimEnd(),
      amount: Number(r.slice(80, 90)),
      customerNo: r.slice(91, 111).trim(),
      result: r.slice(111, 112),
    }));
  if (!header || header.slice(1, 3) !== "91") throw new Error("口座振替の結果データではないようです（ヘッダーの種別コードが91ではありません）");
  return { consignorCode: header.slice(4, 14), day: header.slice(54, 58), data };
}

/** 顧客番号：会員番号（8桁）＋対象月（YYYYMM） */
export const customerNo = (memberNo: number, month: string) => `${String(memberNo).padStart(8, "0")}${month.replace("-", "")}`;
export function parseCustomerNo(no: string) {
  const m = /^(\d{8})(\d{4})(\d{2})$/.exec(no.trim());
  return m ? { memberNo: Number(m[1]), month: `${m[2]}-${m[3]}` } : null;
}
