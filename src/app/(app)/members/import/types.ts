export const FIELDS = {
  externalId: "移行元の会員ID",
  fullName: "氏名（姓名まとめて）",
  lastName: "姓",
  firstName: "名",
  fullKana: "フリガナ（まとめて）",
  lastKana: "セイ",
  firstKana: "メイ",
  email: "メールアドレス",
  phone: "電話番号",
  birthDate: "生年月日",
  gender: "性別",
  status: "ステータス（在籍・休会・退会）",
  joinedAt: "入会日",
  note: "メモに追記",
} as const;

export type Field = keyof typeof FIELDS;
export type ImportRow = Partial<Record<Exclude<Field, "note">, string>> & { note?: string };
export type ImportResult = { created: number; updated: number; skipped: number; errors: { row: number; message: string }[] };
