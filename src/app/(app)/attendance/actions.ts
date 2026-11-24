"use server";
import { revalidatePath } from "next/cache";
import type { ReservationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { str, type ActionState } from "@/lib/action";

/** 出欠をつける（出席・無断欠席・予定に戻す）。欠席連絡・振替の取消は回の画面から */
export async function mark(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const status = str(fd, "status") as ReservationStatus;
  if (!["ATTENDED", "NO_SHOW", "RESERVED"].includes(status)) return { error: "不正な操作です" };
  const r = await db.reservation.findUnique({ where: { id: str(fd, "id") } });
  if (!r || r.status === "CANCELED") return { error: "出欠をつけられません" };
  await db.reservation.update({ where: { id: r.id }, data: { status } });
  await audit(me.id, "attendance.mark", r.id, status);
  revalidatePath("/attendance");
  return { ok: "記録しました" };
}

/** 予定のままの人をまとめて出席にする */
export async function markAll(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const slotId = str(fd, "slotId");
  const { count } = await db.reservation.updateMany({ where: { slotId, status: "RESERVED" }, data: { status: "ATTENDED" } });
  await audit(me.id, "attendance.mark_all", slotId, `${count}名`);
  revalidatePath("/attendance");
  return { ok: `${count}名を出席にしました` };
}
