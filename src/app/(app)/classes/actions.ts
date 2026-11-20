"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { BookingError } from "@/lib/booking";
import { bool, int, optStr, str, type ActionState } from "@/lib/action";
import { addDays, fmtDate, fromJst } from "@/lib/format";
import { enrolledCount, generateLessons, syncClassReservations, todayKey } from "@/lib/school";

const MANAGERS = ["OWNER", "ADMIN"] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function saveLevel(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff([...MANAGERS]);
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) return { error: "レベル名を入力してください" };
  const data = { name, rank: int(fd, "rank", 1), color: str(fd, "color") || "#2563eb", active: id ? bool(fd, "active") : true };
  if (id) await db.level.update({ where: { id }, data });
  else await db.level.create({ data });
  await audit(me.id, id ? "level.update" : "level.create", name);
  revalidatePath("/master/levels");
  return { ok: "保存しました" };
}

export async function saveClass(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff([...MANAGERS]);
  const id = str(fd, "id");
  const name = str(fd, "name");
  const weekday = int(fd, "weekday", -1);
  const startTime = str(fd, "startTime");
  const courtId = str(fd, "courtId");
  if (!name) return { error: "クラス名を入力してください" };
  if (weekday < 0 || weekday > 6) return { error: "曜日を選んでください" };
  if (!/^\d{2}:\d{2}$/.test(startTime)) return { error: "開始時刻を入力してください" };
  if (!courtId) return { error: "コートを選んでください" };
  const data = {
    name,
    weekday,
    startTime,
    courtId,
    levelId: optStr(fd, "levelId"),
    coachId: optStr(fd, "coachId"),
    durationMin: Math.min(600, Math.max(15, int(fd, "durationMin", 90))),
    capacity: Math.max(1, int(fd, "capacity", 8)),
    description: optStr(fd, "description"),
    active: id ? bool(fd, "active") : true,
  };
  if (id) {
    const cur = await db.schoolClass.findUniqueOrThrow({ where: { id } });
    const n = await enrolledCount(id);
    if (data.capacity < n) return { error: `在籍者（${n}名）より少ない定員にはできません` };
    await db.schoolClass.update({ where: { id }, data });
    // 定員・担当・コートは、これから先の回にも反映する（曜日・時刻の変更は新しく生成する回から）
    await db.slot.updateMany({
      where: { classId: id, startsAt: { gt: new Date() }, status: "OPEN" },
      data: { title: name, capacity: data.capacity, instructorId: data.coachId, ...(cur.courtId !== courtId ? { courtId } : {}) },
    });
    await audit(me.id, "class.update", name);
    revalidatePath(`/classes/${id}`);
    return { ok: "保存しました。曜日・時刻を変えた場合は、今後の回を作り直してください" };
  }
  const c = await db.schoolClass.create({ data });
  await audit(me.id, "class.create", name);
  redirect(`/classes/${c.id}`);
}

/** 期間を指定して回を生成（classId なしなら有効な全クラス） */
export async function generateClassLessons(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff([...MANAGERS]);
  const from = str(fd, "from");
  const to = str(fd, "to");
  if (!DATE.test(from) || !DATE.test(to) || from > to) return { error: "期間を正しく入力してください" };
  if (to > addDays(from, 186)) return { error: "一度に生成できるのは6か月分までです" };
  const classId = str(fd, "classId");
  const classes = classId ? [{ id: classId }] : await db.schoolClass.findMany({ where: { active: true }, select: { id: true } });
  let created = 0;
  const skipped: string[] = [];
  try {
    for (const c of classes) {
      const r = await generateLessons(c.id, from, to);
      created += r.created;
      skipped.push(...r.skipped.map((s) => `${s.date} ${s.reason}`));
    }
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  await audit(me.id, "class.generate", classId || "all", `${from}〜${to} ${created}回`);
  revalidatePath("/classes", "layout");
  revalidatePath("/schedule");
  return { ok: `${created}回を作成しました${skipped.length ? `（作成できなかった日：${skipped.slice(0, 10).join("、")}${skipped.length > 10 ? " ほか" : ""}）` : ""}` };
}

export async function enroll(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const classId = str(fd, "classId");
  const memberId = str(fd, "memberId");
  const start = str(fd, "startDate") || todayKey();
  if (!DATE.test(start)) return { error: "開始日を正しく入力してください" };
  const [c, m] = await Promise.all([db.schoolClass.findUnique({ where: { id: classId } }), db.member.findUnique({ where: { id: memberId } })]);
  if (!c || !m) return { error: "クラスまたは会員が見つかりません" };
  if (m.status !== "ACTIVE") return { error: "有効な会員ではありません（休会・退会中）" };
  const startDate = fromJst(start);
  const existing = await db.enrollment.findFirst({ where: { classId, memberId, OR: [{ endDate: null }, { endDate: { gte: startDate } }] } });
  if (existing) return { error: "この会員はすでにこのクラスに在籍しています" };
  const n = await enrolledCount(classId, startDate);
  if (n >= c.capacity) return { error: `定員（${c.capacity}名）に達しています` };
  await db.enrollment.create({ data: { classId, memberId, startDate } });
  const s = await syncClassReservations(classId, memberId);
  await audit(me.id, "class.enroll", classId, `${m.lastName} ${m.firstName} ${start}〜`);
  revalidatePath(`/classes/${classId}`);
  return { ok: `${m.lastName} ${m.firstName}さんを在籍登録しました（今後の${s.added}回に出席予定を入れました）` };
}

/** 在籍の終了（退会・クラス変更）。終了日より後の出席予定は消す */
export async function endEnrollment(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const id = str(fd, "id");
  const end = str(fd, "endDate");
  if (!DATE.test(end)) return { error: "最終日を入力してください" };
  const e = await db.enrollment.findUnique({ where: { id } });
  if (!e) return { error: "在籍が見つかりません" };
  const endDate = fromJst(end);
  if (endDate < e.startDate) {
    await db.enrollment.delete({ where: { id } });
  } else {
    await db.enrollment.update({ where: { id }, data: { endDate } });
  }
  const s = await syncClassReservations(e.classId, e.memberId);
  await audit(me.id, "class.unenroll", e.classId, `${e.memberId} 〜${end}`);
  revalidatePath(`/classes/${e.classId}`);
  return { ok: `在籍を${fmtDate(endDate)}までにしました（以降の${s.removed}回の出席予定を消しました）` };
}

// ---- 振替の権利（スタッフ操作） ----

export async function issueCredit(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const memberId = str(fd, "memberId");
  const exp = str(fd, "expiresAt");
  const count = Math.min(10, Math.max(1, int(fd, "count", 1)));
  if (!DATE.test(exp)) return { error: "有効期限を入力してください" };
  const m = await db.member.findUnique({ where: { id: memberId } });
  if (!m) return { error: "会員が見つかりません" };
  const levelRank = str(fd, "levelRank") === "" ? null : int(fd, "levelRank");
  const expiresAt = new Date(fromJst(addDays(exp, 1)).getTime() - 1);
  for (let i = 0; i < count; i++) {
    await db.makeupCredit.create({ data: { memberId, reason: "手動発行", note: optStr(fd, "note"), levelRank, expiresAt, staffId: me.id } });
  }
  await audit(me.id, "makeup.issue", memberId, `${count}件 〜${exp}`);
  revalidatePath("/makeups");
  revalidatePath(`/members/${memberId}`);
  return { ok: `${m.lastName} ${m.firstName}さんに振替を${count}件発行しました` };
}

export async function updateCredit(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const id = str(fd, "id");
  const c = await db.makeupCredit.findUnique({ where: { id } });
  if (!c) return { error: "振替の権利が見つかりません" };
  if (str(fd, "op") === "void") {
    if (c.status !== "AVAILABLE") return { error: "未使用の権利のみ無効にできます" };
    await db.makeupCredit.update({ where: { id }, data: { status: "VOID", note: optStr(fd, "note") ?? "スタッフが無効化" } });
    await audit(me.id, "makeup.void", id);
  } else {
    const exp = str(fd, "expiresAt");
    if (!DATE.test(exp)) return { error: "有効期限を入力してください" };
    await db.makeupCredit.update({ where: { id }, data: { expiresAt: new Date(fromJst(addDays(exp, 1)).getTime() - 1) } });
    await audit(me.id, "makeup.extend", id, exp);
  }
  revalidatePath("/makeups");
  revalidatePath(`/members/${c.memberId}`);
  return { ok: "更新しました" };
}
