// ビルド時にDBマイグレーションを適用する。DB未接続（初回デプロイ）の場合はスキップ。
import { execSync } from "node:child_process";
if (!process.env.DATABASE_URL) {
  console.warn("[migrate] DATABASE_URL が未設定のためマイグレーションをスキップします");
} else {
  if (!process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
}
