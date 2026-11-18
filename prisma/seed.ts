import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const jst = (date: string, time: string) => new Date(`${date}T${time}:00+09:00`);
const dayKey = (offset: number) => new Date(Date.now() + 9 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);

async function main() {
  const email = process.env.SEED_OWNER_EMAIL ?? "owner@example.com";
  const password = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123";
  await db.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1, facilityName: "pickleland" } });
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
}

main().finally(() => db.$disconnect());
