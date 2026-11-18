-- チケット制度の廃止

-- 回数券プランは都度払いに変更
UPDATE "Plan" SET "kind" = 'DROP_IN' WHERE "kind" = 'TICKET';

ALTER TYPE "PlanKind" RENAME TO "PlanKind_old";
CREATE TYPE "PlanKind" AS ENUM ('MONTHLY', 'DROP_IN');
ALTER TABLE "Plan" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TABLE "Plan" ALTER COLUMN "kind" TYPE "PlanKind" USING ("kind"::text::"PlanKind");
ALTER TABLE "Plan" ALTER COLUMN "kind" SET DEFAULT 'MONTHLY';
DROP TYPE "PlanKind_old";

ALTER TABLE "Plan" DROP COLUMN "ticketCount";
ALTER TABLE "Member" DROP COLUMN "tickets";
ALTER TABLE "Program" DROP COLUMN "ticketCost";
ALTER TABLE "Slot" DROP COLUMN "ticketCost";
ALTER TABLE "Reservation" DROP COLUMN "ticketsUsed";
