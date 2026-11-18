"use server";
import { revalidatePath } from "next/cache";
import type { PlanKind, SlotKind } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { bool, int, optStr, str, type ActionState } from "@/lib/action";

const MANAGERS = ["OWNER", "ADMIN"] as const;

export async function savePlan(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff([...MANAGERS]);
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) return { error: "プラン名を入力してください" };
  const kind = str(fd, "kind") as PlanKind;
  if (!["MONTHLY", "DROP_IN"].includes(kind)) return { error: "種別が不正です" };
  const data = {
    name,
    kind,
    price: Math.max(0, int(fd, "price")),
    description: optStr(fd, "description"),
    active: id ? bool(fd, "active") : true,
    sortOrder: int(fd, "sortOrder"),
  };
  if (id) await db.plan.update({ where: { id }, data });
  else await db.plan.create({ data });
  await audit(me.id, id ? "plan.update" : "plan.create", name);
  revalidatePath("/master/plans");
  return { ok: "保存しました" };
}

export async function saveCourt(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff([...MANAGERS]);
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) return { error: "コート名を入力してください" };
  const data = { name, description: optStr(fd, "description"), active: id ? bool(fd, "active") : true, sortOrder: int(fd, "sortOrder") };
  if (id) await db.court.update({ where: { id }, data });
  else await db.court.create({ data });
  await audit(me.id, id ? "court.update" : "court.create", name);
  revalidatePath("/master/courts");
  return { ok: "保存しました" };
}

export async function saveProgram(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff([...MANAGERS]);
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) return { error: "プログラム名を入力してください" };
  const kind = str(fd, "kind") as SlotKind;
  if (!["LESSON", "RENTAL", "EVENT"].includes(kind)) return { error: "種別が不正です" };
  const color = /^#[0-9a-fA-F]{6}$/.test(str(fd, "color")) ? str(fd, "color") : "#2563eb";
  const data = {
    name,
    kind,
    description: optStr(fd, "description"),
    capacity: Math.max(1, int(fd, "capacity", 1)),
    durationMin: Math.max(15, int(fd, "durationMin", 60)),
    price: Math.max(0, int(fd, "price")),
    color,
    active: id ? bool(fd, "active") : true,
  };
  if (id) await db.program.update({ where: { id }, data });
  else await db.program.create({ data });
  await audit(me.id, id ? "program.update" : "program.create", name);
  revalidatePath("/master/programs");
  return { ok: "保存しました" };
}
