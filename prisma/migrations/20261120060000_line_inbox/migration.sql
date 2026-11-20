-- CreateEnum
CREATE TYPE "LineDirection" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "LineContact" (
    "id" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "pictureUrl" TEXT,
    "followed" BOOLEAN NOT NULL DEFAULT true,
    "needsReply" BOOLEAN NOT NULL DEFAULT false,
    "unread" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "lastText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineMessage" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "direction" "LineDirection" NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "lineMessageId" TEXT,
    "staffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LineContact_lineUserId_key" ON "LineContact"("lineUserId");

-- CreateIndex
CREATE INDEX "LineContact_lastMessageAt_idx" ON "LineContact"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "LineMessage_lineMessageId_key" ON "LineMessage"("lineMessageId");

-- CreateIndex
CREATE INDEX "LineMessage_contactId_createdAt_idx" ON "LineMessage"("contactId", "createdAt");

-- AddForeignKey
ALTER TABLE "LineMessage" ADD CONSTRAINT "LineMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "LineContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineMessage" ADD CONSTRAINT "LineMessage_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

