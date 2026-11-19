# pickleland

ピックルボール施設の会員・予約・大会エントリー管理アプリ。リポジトリ名は courtbase だが、UI・文書での名称は **pickleland**。
Next.js 15（App Router / Server Actions）+ TypeScript + Prisma（PostgreSQL / Neon）+ Tailwind。Vercel Hobby で公開。
オーナーとのやり取り・コミットメッセージ・UI文言は日本語。

## コマンド
- 開発サーバー: `npm run dev`
- 型チェック: `npx tsc --noEmit`（コード変更後は必ず実行。schema.prisma を変えたら先に `npx prisma generate`）
- ビルド確認: `npx next build`
- スキーマ変更: `prisma/schema.prisma` を編集 → `npx prisma migrate dev --name <内容>`（ローカルDBのみ）
- `npm run build` は使わない。ビルド中に `prisma migrate deploy` が走り、`.env` の DB にマイグレーションが適用されてしまう
- `npm run lint` は使わない（ESLint 未導入）

## IMPORTANT
- 本番DB（Neon）に触れる操作はしない。マイグレーションは Vercel のデプロイ時に自動で適用される
- コミット済みのマイグレーション（`prisma/migrations/`）は編集しない。変更は必ず新しいマイグレーションで行う
- 秘密情報（DB URL・LINE/Stripe のキー）は `.env` のみ。コード・コミットに書かない。新しい環境変数は `.env.example` にも追記する
- Server Actions と API ルートでは毎回権限を確認する: スタッフ画面は `requireStaff()`（`src/lib/auth.ts`、ロールは OWNER / ADMIN / STAFF）、会員画面（`src/app/my`）は `requireMember()`（`src/lib/member-auth.ts`）
- Stripe は現在テストモード。本番切り替えはオーナーの指示があるまで行わない

## 構成
- `src/app/(app)` スタッフ用管理画面 / `src/app/my` 会員用（LINEログイン）/ `src/app/api` LINE・Stripe webhook・cron
- `src/lib` 共通処理（db, auth, booking, entry, stripe, line など）
- Vercel Hobby の cron は1日1回まで（`vercel.json`）

## 方針
- 管理画面はできるだけ簡素に。機能は段階的に追加する
- 3ファイル以上の変更や DB スキーマ変更を伴う作業は、実装前に計画を示す
- 完了報告には、実行した確認コマンドとその結果を添える
- コンパクト時は、変更したファイルの一覧と実行した確認コマンドを必ず残す
