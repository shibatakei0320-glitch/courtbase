---
name: ship
description: pickleland の変更をブランチにコミットし、GitHub に PR を作る。オーナーが /ship と打ったときだけ使う。
disable-model-invocation: true
---
# コミットして PR を出す

追加の指示: $ARGUMENTS

1. `/check` の手順で検証する。失敗があれば止めて報告する
2. main にいる場合は、内容に合ったブランチ（例: `feature/event-entry`、`fix/line-login`）を作って切り替える
3. 変更をまとめてコミットする。メッセージは日本語で「何を・なぜ」を1〜3行で書く
4. `git push -u origin <ブランチ>` でプッシュする
5. `gh pr create` で PR を作る。本文には次を日本語で書く
   - 変更内容（箇条書き）
   - DB スキーマ変更の有無（あれば「マージ後の Vercel デプロイ時に自動適用される」と明記）
   - 新しい環境変数の有無（あれば Vercel に設定が必要な旨）
   - 動作確認の手順
6. PR の URL を報告する。マージはしない（オーナーが確認してからマージする）
