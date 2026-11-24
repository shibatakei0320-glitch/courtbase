"use server";
import { BRAND, SCHOOL } from "@/lib/brand";
import { isBankKana, toBankKana } from "@/lib/zengin";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { bool, int, optStr, str, type ActionState } from "@/lib/action";

export async function saveSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff(["OWNER"]);
  const data = {
    facilityName: str(fd, "facilityName") || BRAND,
    openHour: Math.min(23, Math.max(0, int(fd, "openHour", 7))),
    closeHour: Math.min(24, Math.max(1, int(fd, "closeHour", 23))),
    cancelDeadlineHours: Math.max(0, int(fd, "cancelDeadlineHours", 24)),
    sessionHours: Math.min(720, Math.max(1, int(fd, "sessionHours", 12))),
    contactEmail: optStr(fd, "contactEmail"),
    facilityMode: bool(fd, "facilityMode"),
    absenceDeadlineHours: Math.min(168, Math.max(0, int(fd, "absenceDeadlineHours", 0))),
    makeupValidDays: Math.min(365, Math.max(0, int(fd, "makeupValidDays", 0))),
    admissionFee: Math.max(0, int(fd, "admissionFee")),
    leaveFee: Math.max(0, int(fd, "leaveFee")),
    prorateMidMonth: bool(fd, "prorateMidMonth"),
    ...(SCHOOL
      ? {
          debitConsignorCode: optStr(fd, "debitConsignorCode"),
          debitConsignorName: optStr(fd, "debitConsignorName") ? toBankKana(str(fd, "debitConsignorName")) : null,
          debitBankCode: str(fd, "debitBankCode") || "0170",
          debitBankName: toBankKana(str(fd, "debitBankName") || "ﾔﾏｸﾞﾁ"),
          debitBranchCode: optStr(fd, "debitBranchCode"),
          debitBranchName: optStr(fd, "debitBranchName") ? toBankKana(str(fd, "debitBranchName")) : null,
          debitAccountType: str(fd, "debitAccountType") === "2" ? 2 : 1,
          debitAccountNo: optStr(fd, "debitAccountNo"),
          debitDay: Math.min(31, Math.max(1, int(fd, "debitDay", 27))),
          stringNotify: bool(fd, "stringNotify"),
        }
      : {}),
    makeupLevelRule: ["SAME", "ONE_BELOW", "SAME_OR_LOWER", "ANY"].includes(str(fd, "makeupLevelRule")) ? str(fd, "makeupLevelRule") : "SAME_OR_LOWER",
    makeupCrossCourse: bool(fd, "makeupCrossCourse"),
    coolMonths: [0, 1, 3, 6].includes(int(fd, "coolMonths", 3)) ? int(fd, "coolMonths", 3) : 3,
    lessonsPerCool: Math.min(52, Math.max(1, int(fd, "lessonsPerCool", 12))),
    legalSeller: optStr(fd, "legalSeller"),
    legalManager: optStr(fd, "legalManager"),
    legalAddress: optStr(fd, "legalAddress"),
    legalPhone: optStr(fd, "legalPhone"),
    legalEmail: optStr(fd, "legalEmail"),
    legalNotes: optStr(fd, "legalNotes"),
    termsText: optStr(fd, "termsText"),
    privacyText: optStr(fd, "privacyText"),
  };
  if (SCHOOL) {
    if (data.debitConsignorCode && !/^\d{10}$/.test(data.debitConsignorCode)) return { error: "委託者コードは10桁の数字です（銀行から通知されたもの）" };
    if (!/^\d{4}$/.test(data.debitBankCode ?? "")) return { error: "取引銀行のコードは4桁の数字です（山口銀行は0170）" };
    if (data.debitBranchCode && !/^\d{3}$/.test(data.debitBranchCode)) return { error: "取引支店のコードは3桁の数字です" };
    if (data.debitAccountNo && !/^\d{1,7}$/.test(data.debitAccountNo)) return { error: "口座番号は7桁までの数字です" };
    for (const [label, v] of [["委託者名", data.debitConsignorName], ["取引銀行名", data.debitBankName], ["取引支店名", data.debitBranchName]] as const)
      if (v && !isBankKana(v)) return { error: `${label}はカナで入力してください（漢字は使えません）` };
  }
  await db.setting.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  await audit(me.id, "setting.update");
  revalidatePath("/", "layout");
  return { ok: "設定を保存しました" };
}
