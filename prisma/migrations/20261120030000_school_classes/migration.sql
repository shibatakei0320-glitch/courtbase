-- CreateEnum
CREATE TYPE "ReservationKind" AS ENUM ('NORMAL', 'REGULAR', 'MAKEUP');

-- CreateEnum
CREATE TYPE "CreditStatus" AS ENUM ('AVAILABLE', 'USED', 'VOID');

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "kind" "ReservationKind" NOT NULL DEFAULT 'NORMAL';

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "absenceDeadlineHours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "makeupLevelRule" TEXT NOT NULL DEFAULT 'SAME_OR_LOWER',
ADD COLUMN     "makeupValidDays" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "Slot" ADD COLUMN     "classId" TEXT;

-- CreateTable
CREATE TABLE "Level" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "color" TEXT NOT NULL DEFAULT '#2563eb',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolClass" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "levelId" TEXT,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 90,
    "courtId" TEXT NOT NULL,
    "coachId" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 8,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MakeupCredit" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "CreditStatus" NOT NULL DEFAULT 'AVAILABLE',
    "reason" TEXT NOT NULL,
    "sourceReservationId" TEXT,
    "levelRank" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedReservationId" TEXT,
    "note" TEXT,
    "staffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MakeupCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Enrollment_classId_idx" ON "Enrollment"("classId");

-- CreateIndex
CREATE INDEX "Enrollment_memberId_idx" ON "Enrollment"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "MakeupCredit_sourceReservationId_key" ON "MakeupCredit"("sourceReservationId");

-- CreateIndex
CREATE UNIQUE INDEX "MakeupCredit_usedReservationId_key" ON "MakeupCredit"("usedReservationId");

-- CreateIndex
CREATE INDEX "MakeupCredit_memberId_status_idx" ON "MakeupCredit"("memberId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Slot_classId_startsAt_key" ON "Slot"("classId", "startsAt");

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MakeupCredit" ADD CONSTRAINT "MakeupCredit_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

