-- 特商法表記・規約と、入退場記録

ALTER TABLE "Setting" ADD COLUMN "legalSeller" TEXT;
ALTER TABLE "Setting" ADD COLUMN "legalManager" TEXT;
ALTER TABLE "Setting" ADD COLUMN "legalAddress" TEXT;
ALTER TABLE "Setting" ADD COLUMN "legalPhone" TEXT;
ALTER TABLE "Setting" ADD COLUMN "legalEmail" TEXT;
ALTER TABLE "Setting" ADD COLUMN "legalNotes" TEXT;
ALTER TABLE "Setting" ADD COLUMN "termsText" TEXT;
ALTER TABLE "Setting" ADD COLUMN "privacyText" TEXT;

CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkOutAt" TIMESTAMP(3),
    "staffId" TEXT,
    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Visit_checkInAt_idx" ON "Visit"("checkInAt");
CREATE INDEX "Visit_memberId_checkInAt_idx" ON "Visit"("memberId", "checkInAt");
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
