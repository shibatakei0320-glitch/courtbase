-- 施設の予約・入退場機能のオン／オフ（初期値オフ）
ALTER TABLE "Setting" ADD COLUMN "facilityMode" BOOLEAN NOT NULL DEFAULT false;
