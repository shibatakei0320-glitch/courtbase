-- 大会の種目・エントリー情報・一括連絡

CREATE TYPE "EntryFormat" AS ENUM ('SINGLES', 'DOUBLES', 'TEAM');

ALTER TABLE "Slot" ADD COLUMN "publicEntries" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "EventCategory" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" "EntryFormat" NOT NULL DEFAULT 'DOUBLES',
    "level" TEXT,
    "teamSize" INTEGER NOT NULL DEFAULT 4,
    "capacity" INTEGER NOT NULL DEFAULT 16,
    "price" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventCategory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EventCategory_slotId_idx" ON "EventCategory"("slotId");
ALTER TABLE "EventCategory" ADD CONSTRAINT "EventCategory_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Reservation" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "Reservation" ADD COLUMN "teamName" TEXT;
ALTER TABLE "Reservation" ADD COLUMN "players" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EventCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "EventMessage" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "categoryId" TEXT,
    "body" TEXT NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "staffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EventMessage_slotId_createdAt_idx" ON "EventMessage"("slotId", "createdAt");
ALTER TABLE "EventMessage" ADD CONSTRAINT "EventMessage_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
