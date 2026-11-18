-- 会員ポータル（LINEログイン）とStripe決済

ALTER TABLE "Member" ADD COLUMN "lineUserId" TEXT;
CREATE UNIQUE INDEX "Member_lineUserId_key" ON "Member"("lineUserId");

CREATE TABLE "MemberSession" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MemberSession_memberId_idx" ON "MemberSession"("memberId");
ALTER TABLE "MemberSession" ADD CONSTRAINT "MemberSession_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD COLUMN "stripeSessionId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "stripePaymentIntentId" TEXT;
CREATE UNIQUE INDEX "Payment_stripeSessionId_key" ON "Payment"("stripeSessionId");
