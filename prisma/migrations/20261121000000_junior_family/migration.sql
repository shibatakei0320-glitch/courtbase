-- CreateEnum
CREATE TYPE "ClassTarget" AS ENUM ('ADULT', 'JUNIOR');

-- AlterTable
ALTER TABLE "MakeupCredit" ADD COLUMN     "target" "ClassTarget";

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "guardianId" TEXT;

-- AlterTable
ALTER TABLE "SchoolClass" ADD COLUMN     "target" "ClassTarget" NOT NULL DEFAULT 'ADULT';

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;


