import bcrypt from "bcryptjs";

export const PASSWORD_RULE = "8文字以上で、英字と数字をそれぞれ1文字以上含めてください";

export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "パスワードは8文字以上にしてください";
  if (pw.length > 128) return "パスワードは128文字以内にしてください";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "パスワードには英字と数字をそれぞれ1文字以上含めてください";
  return null;
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
