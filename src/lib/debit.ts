import "server-only";
import { db } from "./db";
import { buildRequest, customerNo, isBankKana, toSjis, type DebitRow } from "./zengin";
import { monthKey } from "./school";

/*
 * 月謝の口座振替（山口銀行など、全銀協フォーマット）
 * 1. 対象月の未入金の月謝のうち、支払方法が「口座振替」の会員の分を依頼データにする
 * 2. 銀行から戻った結果データを取り込み、振替済は入金済みに、振替不能は理由を記録する
 */

export type DebitProblem = { memberId: string; name: string; reason: string };

/** 口座情報のチェック（足りないものを返す） */
export function accountProblem(m: { bankCode: string | null; branchCode: string | null; accountNo: string | null; accountHolder: string | null; accountType: number | null }) {
  if (!/^\d{4}$/.test(m.bankCode ?? "")) return "金融機関コード（4桁）がありません";
  if (!/^\d{3}$/.test(m.branchCode ?? "")) return "支店コード（3桁）がありません";
  if (!/^\d{1,7}$/.test(m.accountNo ?? "")) return "口座番号（7桁まで）がありません";
  if (!m.accountHolder || !isBankKana(m.accountHolder)) return "預金者名（カナ）がありません";
  if (m.accountType !== 1 && m.accountType !== 2) return "預金種目がありません";
  return null;
}

export async function debitSettings() {
  const s = await db.setting.findUnique({ where: { id: 1 } });
  const missing: string[] = [];
  if (!/^\d{10}$/.test(s?.debitConsignorCode ?? "")) missing.push("委託者コード（10桁）");
  if (!s?.debitConsignorName) missing.push("委託者名（カナ）");
  if (!/^\d{3}$/.test(s?.debitBranchCode ?? "")) missing.push("取引支店コード");
  if (!/^\d{1,7}$/.test(s?.debitAccountNo ?? "")) missing.push("口座番号");
  return { s, missing };
}

/** 依頼データの対象と、対象にできない会員（引き落とせなかった月謝は、現金などで集金するため対象にしない） */
export async function debitTargets(month: string) {
  const invoices = await db.invoice.findMany({ where: { month, status: "UNPAID", amount: { gt: 0 }, debitResult: null, member: { tuitionMethod: "DEBIT" } }, include: { member: true }, orderBy: { member: { memberNo: "asc" } } });
  const ok: typeof invoices = [];
  const problems: DebitProblem[] = [];
  for (const i of invoices) {
    const p = accountProblem(i.member);
    if (p) problems.push({ memberId: i.memberId, name: `${i.member.lastName} ${i.member.firstName}`, reason: p });
    else ok.push(i);
  }
  return { ok, problems };
}

/** 依頼データ（Shift_JIS）を作る。作った請求に依頼日を記録する */
export async function buildDebitFile(month: string) {
  const { s, missing } = await debitSettings();
  if (!s || missing.length) throw new Error(`施設設定の口座振替の項目を入力してください：${missing.join("、")}`);
  const { ok } = await debitTargets(month);
  if (!ok.length) throw new Error("口座振替の対象になる未入金の月謝がありません");
  const [y, m] = month.split("-").map(Number);
  const day = Math.min(s.debitDay, new Date(Date.UTC(y, m, 0)).getUTCDate());
  const rows: DebitRow[] = ok.map((i) => ({
    bankCode: i.member.bankCode!,
    bankName: i.member.bankName ?? "",
    branchCode: i.member.branchCode!,
    branchName: i.member.branchName ?? "",
    accountType: i.member.accountType!,
    accountNo: i.member.accountNo!,
    holder: i.member.accountHolder!,
    amount: i.amount,
    // 初めての振替（または初めて出した月の作り直し）は新規コード「1」
    isNew: !i.member.debitFirstSentAt || monthKey(i.member.debitFirstSentAt) === monthKey(new Date()),
    customerNo: customerNo(i.member.memberNo, month),
  }));
  const lines = buildRequest(
    {
      code: s.debitConsignorCode!,
      name: s.debitConsignorName!,
      day: `${String(m).padStart(2, "0")}${String(day).padStart(2, "0")}`,
      bankCode: s.debitBankCode,
      bankName: s.debitBankName,
      branchCode: s.debitBranchCode!,
      branchName: s.debitBranchName ?? "",
      accountType: s.debitAccountType,
      accountNo: s.debitAccountNo!,
    },
    rows,
  );
  const now = new Date();
  await db.invoice.updateMany({ where: { id: { in: ok.map((i) => i.id) } }, data: { debitSentAt: now, debitResult: null } });
  await db.member.updateMany({ where: { id: { in: ok.map((i) => i.memberId) }, debitFirstSentAt: null }, data: { debitFirstSentAt: now } });
  return { bytes: toSjis(lines), count: rows.length, total: rows.reduce((a, r) => a + r.amount, 0) };
}
