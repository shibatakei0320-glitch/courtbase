-- CreateEnum
CREATE TYPE "StringStatus" AS ENUM ('RECEIVED', 'DONE', 'DELIVERED', 'CANCELED');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('ENTERED', 'SUBMITTED', 'CANCELED');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'DEBIT';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "debitResult" TEXT,
ADD COLUMN     "debitSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "accountHolder" TEXT,
ADD COLUMN     "accountNo" TEXT,
ADD COLUMN     "accountType" INTEGER,
ADD COLUMN     "associationName" TEXT,
ADD COLUMN     "associationNo" TEXT,
ADD COLUMN     "bankCode" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "branchCode" TEXT,
ADD COLUMN     "branchName" TEXT,
ADD COLUMN     "debitFirstSentAt" TIMESTAMP(3),
ADD COLUMN     "emergencyName" TEXT,
ADD COLUMN     "emergencyPhone" TEXT,
ADD COLUMN     "emergencyRelation" TEXT,
ADD COLUMN     "insuranceYear" INTEGER,
ADD COLUMN     "medicalNote" TEXT,
ADD COLUMN     "schoolName" TEXT,
ADD COLUMN     "tuitionMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH';

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "debitAccountNo" TEXT,
ADD COLUMN     "debitAccountType" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "debitBankCode" TEXT NOT NULL DEFAULT '0170',
ADD COLUMN     "debitBankName" TEXT NOT NULL DEFAULT 'ﾔﾏｸﾞﾁ',
ADD COLUMN     "debitBranchCode" TEXT,
ADD COLUMN     "debitBranchName" TEXT,
ADD COLUMN     "debitConsignorCode" TEXT,
ADD COLUMN     "debitConsignorName" TEXT,
ADD COLUMN     "debitDay" INTEGER NOT NULL DEFAULT 27,
ADD COLUMN     "stringNotify" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "StringJob" (
    "id" TEXT NOT NULL,
    "memberId" TEXT,
    "customer" TEXT,
    "racket" TEXT NOT NULL,
    "stringName" TEXT NOT NULL,
    "tension" TEXT NOT NULL,
    "note" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "status" "StringStatus" NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "paymentId" TEXT,
    "staffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StringJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizer" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "venue" TEXT,
    "entryDeadline" TIMESTAMP(3),
    "fee" INTEGER NOT NULL DEFAULT 0,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentEntry" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "partner" TEXT,
    "note" TEXT,
    "status" "EntryStatus" NOT NULL DEFAULT 'ENTERED',
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StringJob_paymentId_key" ON "StringJob"("paymentId");

-- CreateIndex
CREATE INDEX "StringJob_status_receivedAt_idx" ON "StringJob"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "StringJob_memberId_idx" ON "StringJob"("memberId");

-- CreateIndex
CREATE INDEX "Tournament_date_idx" ON "Tournament"("date");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentEntry_paymentId_key" ON "TournamentEntry"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentEntry_tournamentId_memberId_category_key" ON "TournamentEntry"("tournamentId", "memberId", "category");

-- AddForeignKey
ALTER TABLE "StringJob" ADD CONSTRAINT "StringJob_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentEntry" ADD CONSTRAINT "TournamentEntry_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentEntry" ADD CONSTRAINT "TournamentEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

