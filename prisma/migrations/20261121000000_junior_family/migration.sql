-- CreateEnum
CREATE TYPE "ClassTarget" AS ENUM ('ADULT', 'JUNIOR');

-- AlterTable
ALTER TABLE "MakeupCredit" ADD COLUMN     "target" "ClassTarget";

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "guardianId" TEXT;

-- AlterTable
ALTER TABLE "SchoolClass" ADD COLUMN     "target" "ClassTarget" NOT NULL DEFAULT 'ADULT';

-- AlterTable
ALTER TABLE "Setting" ALTER COLUMN "facilityName" SET DEFAULT '48Kテニススクール';

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- 施設名の初期値を 48Kテニススクール に（未変更の既定値だけを置き換える）
UPDATE "Setting" SET "facilityName" = '48Kテニススクール' WHERE "facilityName" IN ('pickleland', 'CourtBase');
