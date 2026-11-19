---
name: check
description: pickleland の変更を検証する（型チェック・ビルド・権限チェック・秘密情報の混入確認）。実装の完了前、コミット前、「確認して」と言われたときに使う。
---
# 変更の検証

次の順に実行し、各ステップの実行コマンドと結果を報告する。失敗したら原因を直して、そのステップからやり直す。

1. `git status` と `git diff` で変更範囲を把握する
2. `prisma/schema.prisma` に変更があれば `npx prisma validate` → `npx prisma generate`
3. `npx tsc --noEmit`
4. `npx next build`（`npm run build` は本番DBにマイグレーションが走るので使わない）
5. 差分を読んで次を確認する
   - 新しい Server Action / API ルートに `requireStaff()` または `requireMember()` があるか。管理者以上の操作は `requireStaff(["OWNER", "ADMIN"])` か
   - 金額・定員・日時など、ユーザー入力を zod などでサーバー側で検証しているか
   - 秘密情報（キー・トークン・DB URL）がコードに入っていないか。新しい環境変数は `.env.example` に追記したか
   - スキーマ変更なら、新しいマイグレーションファイルが作られているか（既存ファイルを編集していないか）
6. 結果を「✅ 通過 / ❌ 要修正」の一覧で報告する
