"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { BookingError } from "@/lib/booking";
import { bool, int, optStr, str, type ActionState } from "@/lib/action";
import { addDays, fmtDate, fromJst } from "@/lib/format";
import { enrolledCount, expireCreditsAfter, generateLessons, syncClassReservations, syncMember, todayKey } from "@/lib/school";
import { isMonth } from "@/lib/tuition";

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
    planId: optStr(fd, "planId"),
    course: str(fd, "course") === "ACADEMY" ? "ACADEMY" : "ENJOY",
    target: str(fd, "target") === "JUNIOR" ? ("JUNIOR" as const) : ("ADULT" as const),
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
  const planId = optStr(fd, "planId") ?? c.planId;
  const plan = planId ? await db.plan.findUnique({ where: { id: planId } }) : null;
  const isFree = plan?.freeMax != null;
  if (!isFree) {
    const n = await enrolledCount(classId, startDate);
    if (n >= c.capacity) return { error: `定員（${c.capacity}名）に達しています` };
  }
  await db.enrollment.create({ data: { classId, memberId, startDate, planId } });
  const s = await syncClassReservations(classId, memberId);
  await audit(me.id, "class.enroll", classId, `${m.lastName} ${m.firstName} ${start}〜 ${plan?.name ?? ""}`);
  revalidatePath(`/classes/${classId}`);
  revalidatePath(`/members/${memberId}`);
  return {
    ok: isFree
      ? `${m.lastName} ${m.firstName}さんを「${plan!.name}」で登録しました（月${plan!.freeMax}回まで、会員ページから空いている回を予約できます）`
      : `${m.lastName} ${m.firstName}さんを在籍登録しました（今後の${s.added}回に出席予定を入れました）`,
  };
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
  await expireCreditsAfter(e.memberId);
  await audit(me.id, "class.unenroll", e.classId, `${e.memberId} 〜${end}`);
  revalidatePath(`/classes/${e.classId}`);
  revalidatePath(`/members/${e.memberId}`);
  return { ok: `在籍を${fmtDate(endDate)}までにしました（以降の${s.removed}回の出席予定を消しました）` };
}

/** スクールの退会：在籍中のすべてのクラスを最終日で終える */
export async function withdrawAll(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const memberId = str(fd, "memberId");
  const end = str(fd, "endDate");
  if (!DATE.test(end)) return { error: "最終日を入力してください" };
  const endDate = fromJst(end);
  const list = await db.enrollment.findMany({ where: { memberId, OR: [{ endDate: null }, { endDate: { gt: endDate } }] } });
  if (!list.length) return { error: "終了する在籍がありません" };
  for (const e of list) {
    if (endDate < e.startDate) await db.enrollment.delete({ where: { id: e.id } });
    else await db.enrollment.update({ where: { id: e.id }, data: { endDate } });
  }
  const s = await syncMember(memberId);
  await expireCreditsAfter(memberId);
  await audit(me.id, "member.withdraw", memberId, `〜${end}`);
  revalidatePath(`/members/${memberId}`);
  return { ok: `${fmtDate(endDate)}で退会の手続きをしました（${list.length}クラス、以降の出席予定 ${s.removed}回を外しました）。会員ステータスは最終日の後に「退会」に変更してください` };
}

/** クラス変更：変更日の前日で今のクラスを終え、変更日から新しいクラスに在籍 */
export async function transferEnrollment(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const e = await db.enrollment.findUnique({ where: { id: str(fd, "id") }, include: { schoolClass: true, member: true } });
  if (!e) return { error: "在籍が見つかりません" };
  const date = str(fd, "date");
  if (!DATE.test(date)) return { error: "変更日を入力してください" };
  const to = await db.schoolClass.findUnique({ where: { id: str(fd, "classId") } });
  if (!to || to.id === e.classId) return { error: "変更先のクラスを選んでください" };
  if (!to.active) return { error: "変更先のクラスは停止中です" };
  const startDate = fromJst(date);
  if (e.endDate && startDate > new Date(e.endDate.getTime() + 86400_000)) return { error: "変更日が在籍の最終日より後です" };
  if ((await enrolledCount(to.id, startDate)) >= to.capacity) return { error: `「${to.name}」は定員（${to.capacity}名）に達しています` };
  const dup = await db.enrollment.findFirst({ where: { classId: to.id, memberId: e.memberId, OR: [{ endDate: null }, { endDate: { gte: startDate } }] } });
  if (dup) return { error: `すでに「${to.name}」に在籍しています` };
  const lastDay = fromJst(addDays(date, -1));
  await db.$transaction([
    lastDay < e.startDate ? db.enrollment.delete({ where: { id: e.id } }) : db.enrollment.update({ where: { id: e.id }, data: { endDate: lastDay } }),
    db.enrollment.create({ data: { classId: to.id, memberId: e.memberId, startDate, endDate: e.endDate, planId: optStr(fd, "planId") ?? e.planId ?? to.planId } }),
  ]);
  await syncClassReservations(e.classId, e.memberId);
  const s = await syncClassReservations(to.id, e.memberId);
  await audit(me.id, "class.transfer", e.memberId, `${e.schoolClass.name} → ${to.name} ${date}〜`);
  revalidatePath(`/members/${e.memberId}`);
  return { ok: `${fmtDate(startDate)}から「${to.name}」に変更しました（出席予定 ${s.added}回）` };
}

/** 休会の登録（月単位） */
export async function addLeave(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const memberId = str(fd, "memberId");
  const from = str(fd, "fromMonth");
  const to = str(fd, "toMonth") || from;
  if (!isMonth(from) || !isMonth(to) || from > to) return { error: "休会の期間を正しく入力してください" };
  const overlap = await db.leave.findFirst({ where: { memberId, fromMonth: { lte: to }, toMonth: { gte: from } } });
  if (overlap) return { error: `${overlap.fromMonth}〜${overlap.toMonth} の休会と重なっています` };
  await db.leave.create({ data: { memberId, fromMonth: from, toMonth: to, reason: optStr(fd, "reason") } });
  const s = await syncMember(memberId);
  await audit(me.id, "member.leave", memberId, `${from}〜${to}`);
  revalidatePath(`/members/${memberId}`);
  return { ok: `${from}〜${to} を休会にしました（期間中の出席予定 ${s.removed}回を外しました）` };
}

export async function removeLeave(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const l = await db.leave.findUnique({ where: { id: str(fd, "id") } });
  if (!l) return { error: "休会が見つかりません" };
  await db.leave.delete({ where: { id: l.id } });
  const s = await syncMember(l.memberId);
  await audit(me.id, "member.leave_remove", l.memberId, `${l.fromMonth}〜${l.toMonth}`);
  revalidatePath(`/members/${l.memberId}`);
  return { ok: `休会を取り消しました（出席予定 ${s.added}回を戻しました）` };
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
    const target = str(fd, "target") === "JUNIOR" ? "JUNIOR" : str(fd, "target") === "ADULT" ? "ADULT" : null;
    await db.makeupCredit.create({ data: { memberId, reason: "手動発行", note: optStr(fd, "note"), levelRank, target, expiresAt, staffId: me.id } });
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

/** 48K萩校のコース・時間割・料金をまとめて登録 */
export async function applyTemplate(_: ActionState, _fd: FormData): Promise<ActionState> {
  const me = await requireStaff(["OWNER", "ADMIN"]);
  const { applyHagi48k } = await import("@/lib/templates/hagi48k");
  const r = await applyHagi48k();
  await audit(me.id, "class.template", "48K萩校", JSON.stringify(r));
  revalidatePath("/classes", "layout");
  return { ok: `登録しました：クラス ${r.classes}・受講プラン ${r.plans}・段階 ${r.levels}・コート ${r.courts}（すでにあるものはそのまま）。振替のルールとクール制も設定しました` };
}
