-- 早期割引・対戦表公開・キャンセル待ち・対戦表

ALTER TABLE "EventCategory" ADD COLUMN "earlyPrice" INTEGER;
ALTER TABLE "EventCategory" ADD COLUMN "earlyUntil" TIMESTAMP(3);
ALTER TABLE "EventCategory" ADD COLUMN "drawPublished" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Waitlist" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Waitlist_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Waitlist_categoryId_memberId_key" ON "Waitlist"("categoryId", "memberId");
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EventCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "groupName" TEXT,
    "round" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "entryAId" TEXT,
    "entryBId" TEXT,
    "score" TEXT,
    "winnerId" TEXT,
    "court" TEXT,
    "nextMatchId" TEXT,
    "nextSlot" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Match_categoryId_stage_round_position_idx" ON "Match"("categoryId", "stage", "round", "position");
ALTER TABLE "Match" ADD CONSTRAINT "Match_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EventCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
