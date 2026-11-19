"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { bool, int, optStr, str, type ActionState } from "@/lib/action";

export async function saveSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff(["OWNER"]);
  const data = {
    facilityName: str(fd, "facilityName") || "pickleland",
    openHour: Math.min(23, Math.max(0, int(fd, "openHour", 7))),
    closeHour: Math.min(24, Math.max(1, int(fd, "closeHour", 23))),
    cancelDeadlineHours: Math.max(0, int(fd, "cancelDeadlineHours", 24)),
    sessionHours: Math.min(720, Math.max(1, int(fd, "sessionHours", 12))),
    contactEmail: optStr(fd, "contactEmail"),
    facilityMode: bool(fd, "facilityMode"),
    legalSeller: optStr(fd, "legalSeller"),
    legalManager: optStr(fd, "legalManager"),
    legalAddress: optStr(fd, "legalAddress"),
    legalPhone: optStr(fd, "legalPhone"),
    legalEmail: optStr(fd, "legalEmail"),
    legalNotes: optStr(fd, "legalNotes"),
    termsText: optStr(fd, "termsText"),
    privacyText: optStr(fd, "privacyText"),
  };
  await db.setting.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  await audit(me.id, "setting.update");
  revalidatePath("/", "layout");
  return { ok: "設定を保存しました" };
}
