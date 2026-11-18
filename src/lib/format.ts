const TZ = "Asia/Tokyo";

export const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
export const fmtDate = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString("ja-JP", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }) : "-";
export const fmtDateTime = (d: Date | null | undefined) =>
  d ? d.toLocaleString("ja-JP", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";
export const fmtTime = (d: Date) => d.toLocaleTimeString("ja-JP", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
export const fmtWeekday = (d: Date) => d.toLocaleDateString("ja-JP", { timeZone: TZ, month: "numeric", day: "numeric", weekday: "short" });

/** JSTの日付文字列(YYYY-MM-DD)を返す */
export function jstDateKey(d: Date): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}
/** "YYYY-MM-DD" + "HH:mm" (JST) → Date */
export function fromJst(date: string, time = "00:00"): Date {
  return new Date(`${date}T${time}:00+09:00`);
}
/** Date → datetime-local input値 (JST) */
export function toJstInput(d: Date): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 16);
}
export function addDays(dateKey: string, n: number): string {
  const d = fromJst(dateKey);
  return jstDateKey(new Date(d.getTime() + n * 86400_000));
}

export const MEMBER_STATUS = { ACTIVE: "有効", SUSPENDED: "休会", WITHDRAWN: "退会" } as const;
export const PLAN_KIND = { MONTHLY: "月額", DROP_IN: "都度払い" } as const;
export const SLOT_KIND = { LESSON: "レッスン", RENTAL: "コート貸切", EVENT: "大会・イベント" } as const;
export const RES_STATUS = { RESERVED: "予約中", ATTENDED: "出席", NO_SHOW: "無断欠席", CANCELED: "キャンセル" } as const;
export const PAY_METHOD = { CASH: "現金", CARD: "カード", TRANSFER: "振込", OTHER: "その他" } as const;
