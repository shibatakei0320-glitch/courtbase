import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { BRAND, SCHOOL } from "../src/lib/brand";

const db = new PrismaClient();
const jst = (date: string, time: string) => new Date(`${date}T${time}:00+09:00`);
const dayKey = (offset: number) => new Date(Date.now() + 9 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);

async function main() {
  const email = process.env.SEED_OWNER_EMAIL ?? "owner@example.com";
  const password = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123";
  await db.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1, facilityName: BRAND } });
  const owner = await db.staff.upsert({
    where: { email },
    update: {},
    create: { name: "オーナー", email, role: "OWNER", passwordHash: await bcrypt.hash(password, 12), mustChangePassword: !process.env.SEED_DEMO },
  });
  console.log(`owner: ${email} / ${password}`);
  if (!process.env.SEED_DEMO || (await db.court.count()) > 0) return;

  const coach = await db.staff.create({ data: { name: "山田 コーチ", email: "coach@example.com", role: "STAFF", passwordHash: await bcrypt.hash("Coach12345", 12) } });
  const courts = await Promise.all(["Aコート", "Bコート", "Cコート"].map((name, i) => db.court.create({ data: { name, sortOrder: i } })));
  const [monthly, dropIn] = await Promise.all([
    db.plan.create({ data: { name: "レギュラー会員", kind: "MONTHLY", price: 9800, sortOrder: 1 } }),
    db.plan.create({ data: { name: "ビジター", kind: "DROP_IN", price: 2500, sortOrder: 2 } }),
  ]);
  const beginner = await db.program.create({ data: { name: "初心者レッスン", kind: "LESSON", capacity: 8, durationMin: 60, price: 2000, color: "#10b981" } });
  const open = await db.program.create({ data: { name: "オープンプレー", kind: "EVENT", capacity: 16, durationMin: 120, price: 1500, color: "#f59e0b" } });
  const rental = await db.program.create({ data: { name: "コート貸切", kind: "RENTAL", capacity: 4, durationMin: 60, price: 4000, color: "#6366f1" } });

  const names = [["佐藤", "健太", "サトウ", "ケンタ"], ["鈴木", "美咲", "スズキ", "ミサキ"], ["高橋", "翔", "タカハシ", "ショウ"], ["田中", "優子", "タナカ", "ユウコ"], ["伊藤", "大輔", "イトウ", "ダイスケ"], ["渡辺", "さくら", "ワタナベ", "サクラ"], ["中村", "拓也", "ナカムラ", "タクヤ"], ["小林", "愛", "コバヤシ", "アイ"]];
  const members = [];
  for (const [i, [ln, fn, lk, fk]] of names.entries()) {
    const plan = i % 2 === 0 ? monthly : dropIn;
    members.push(await db.member.create({
      data: { lastName: ln, firstName: fn, lastKana: lk, firstKana: fk, email: `member${i + 1}@example.com`, phone: `090-0000-00${10 + i}`, planId: plan.id },
    }));
    await db.payment.create({ data: { memberId: members[i].id, planId: plan.id, amount: plan.price, description: plan.name, method: i % 3 === 0 ? "CARD" : "CASH", staffId: owner.id } });
  }
  for (let d = -1; d < 7; d++) {
    const date = dayKey(d);
    const s1 = await db.slot.create({ data: { title: beginner.name, kind: "LESSON", programId: beginner.id, courtId: courts[0].id, instructorId: coach.id, startsAt: jst(date, "10:00"), endsAt: jst(date, "11:00"), capacity: 8, price: 2000 } });
    await db.slot.create({ data: { title: open.name, kind: "EVENT", programId: open.id, courtId: courts[1].id, startsAt: jst(date, "18:00"), endsAt: jst(date, "20:00"), capacity: 16, price: 1500 } });
    if (d % 2 === 0) await db.slot.create({ data: { title: rental.name, kind: "RENTAL", programId: rental.id, courtId: courts[2].id, startsAt: jst(date, "13:00"), endsAt: jst(date, "14:00"), capacity: 4, price: 4000 } });
    for (const m of members.slice(0, 3 + ((d + 1) % 4))) await db.reservation.create({ data: { slotId: s1.id, memberId: m.id, status: d < 0 ? "ATTENDED" : "RESERVED" } });
  }

  console.log("demo data created");
  if (!SCHOOL) return;
  // スクール（NEXT_PUBLIC_SPORT=tennis のとき）：レベル・定期クラス・在籍・4週間分の回
  const [lv1, lv2] = await Promise.all([
    db.level.create({ data: { name: "初級", rank: 1, color: "#10b981" } }),
    db.level.create({ data: { name: "中級", rank: 2, color: "#f59e0b" } }),
  ]);
  const [fee1, fee2] = await Promise.all([
    db.plan.create({ data: { name: "週1回 初級", kind: "MONTHLY", price: 9800, sortOrder: 3 } }),
    db.plan.create({ data: { name: "週1回 中級", kind: "MONTHLY", price: 11000, sortOrder: 4 } }),
  ]);
  const classes = await Promise.all([
    db.schoolClass.create({ data: { name: "初級 月曜10時", planId: fee1.id, levelId: lv1.id, weekday: 1, startTime: "10:00", durationMin: 90, courtId: courts[2].id, coachId: coach.id, capacity: 6 } }),
    db.schoolClass.create({ data: { name: "初級 土曜10時", planId: fee1.id, levelId: lv1.id, weekday: 6, startTime: "10:00", durationMin: 90, courtId: courts[2].id, coachId: coach.id, capacity: 6 } }),
    db.schoolClass.create({ data: { name: "中級 水曜19時", planId: fee2.id, levelId: lv2.id, weekday: 3, startTime: "19:00", durationMin: 90, courtId: courts[2].id, coachId: coach.id, capacity: 6 } }),
  ]);
  // ジュニア：保護者（佐藤 健太）の子ども2人と、ジュニアクラス
  const kids = await Promise.all([
    db.member.create({ data: { lastName: "佐藤", firstName: "陽向", lastKana: "サトウ", firstKana: "ヒナタ", birthDate: jst("2017-06-10", "00:00"), guardianId: members[0].id } }),
    db.member.create({ data: { lastName: "佐藤", firstName: "結衣", lastKana: "サトウ", firstKana: "ユイ", birthDate: jst("2014-09-03", "00:00"), guardianId: members[0].id } }),
  ]);
  const fee3 = await db.plan.create({ data: { name: "ジュニア 週1回", kind: "MONTHLY", price: 7700, sortOrder: 5 } });
  const lvJ = await db.level.create({ data: { name: "ジュニア", rank: 1, color: "#3b82f6" } });
  classes.push(
    await db.schoolClass.create({ data: { name: "ジュニア 水曜16時", target: "JUNIOR", planId: fee3.id, levelId: lvJ.id, weekday: 3, startTime: "16:00", durationMin: 60, courtId: courts[2].id, coachId: coach.id, capacity: 8 } }),
    await db.schoolClass.create({ data: { name: "ジュニア 金曜16時", target: "JUNIOR", planId: fee3.id, levelId: lvJ.id, weekday: 5, startTime: "16:00", durationMin: 60, courtId: courts[2].id, coachId: coach.id, capacity: 8 } }),
  );
  const today = jst(dayKey(0), "00:00");
  const roster = [members.slice(0, 4), members.slice(2, 6), members.slice(4, 8), kids, []];
  for (const [ci, c] of classes.entries()) {
    for (const m of roster[ci]) await db.enrollment.create({ data: { classId: c.id, memberId: m.id, startDate: today } });
    for (let d = 1; d <= 28; d++) {
      const date = dayKey(d);
      if (new Date(jst(date, "12:00").getTime() + 9 * 3600_000).getUTCDay() !== c.weekday) continue;
      const startsAt = jst(date, c.startTime);
      const slot = await db.slot.create({
        data: { title: c.name, kind: "LESSON", classId: c.id, courtId: c.courtId, instructorId: c.coachId, startsAt, endsAt: new Date(startsAt.getTime() + c.durationMin * 60_000), capacity: c.capacity },
      });
      for (const m of roster[ci]) await db.reservation.create({ data: { slotId: slot.id, memberId: m.id, kind: "REGULAR" } });
    }
  }
  console.log("demo data created");
}

main().finally(() => db.$disconnect());
