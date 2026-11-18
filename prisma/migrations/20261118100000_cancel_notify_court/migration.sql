-- 会員キャンセル・返金、LINEリマインド、時間指定のコート予約

ALTER TABLE "Court" ADD COLUMN "hourlyPrice" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Court" ADD COLUMN "memberBookable" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Slot" ADD COLUMN "memberBooked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Slot" ADD COLUMN "heldById" TEXT;
ALTER TABLE "Slot" ADD COLUMN "heldUntil" TIMESTAMP(3);

ALTER TABLE "Reservation" ADD COLUMN "remindedAt" TIMESTAMP(3);

ALTER TABLE "Payment" ADD COLUMN "reservationId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "refundedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Payment_reservationId_key" ON "Payment"("reservationId");
