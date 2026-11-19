-- 移行元の会員ID（重複取り込み防止）
ALTER TABLE "Member" ADD COLUMN "externalId" TEXT;
CREATE UNIQUE INDEX "Member_externalId_key" ON "Member"("externalId");
