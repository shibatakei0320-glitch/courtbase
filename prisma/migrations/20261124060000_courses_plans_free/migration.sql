-- AlterEnum
ALTER TYPE "ReservationKind" ADD VALUE 'FREE';

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "planId" TEXT;

-- AlterTable
ALTER TABLE "MakeupCredit" ADD COLUMN     "course" TEXT;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "course" TEXT,
ADD COLUMN     "extraDiscount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "freeMax" INTEGER,
ADD COLUMN     "lessonsPerMonth" INTEGER,
ADD COLUMN     "levelId" TEXT,
ADD COLUMN     "target" "ClassTarget";

-- AlterTable
ALTER TABLE "SchoolClass" ADD COLUMN     "course" TEXT NOT NULL DEFAULT 'ENJOY';

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "coolMonths" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "lessonsPerCool" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "makeupCrossCourse" BOOLEAN NOT NULL DEFAULT true;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

