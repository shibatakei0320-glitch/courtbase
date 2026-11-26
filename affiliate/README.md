# アフィリエイトサイト（ピラティス・ジム 体験予約型）

`data/programs.json`（案件）と `content/*.md`（記事）から静的サイトを生成します。依存なしの Node.js だけで動きます（下書き生成のみ Anthropic SDK を使用）。

## 自動化されていること / 人がやること

| 工程 | 担当 | コマンド |
|---|---|---|
| 記事の下書き作成 | Claude（自動） | `npm run draft -- --slug xxx --keyword "..." --programs id1,id2 --notes "現場メモ"` |
| 事実確認・体験談の追記・公開判断 | **人** | 記事の `【要確認】` `【体験談を追記】` を埋めて `status: published` |
| PR表記・`rel="sponsored"`・比較表・サイトマップ・運営者情報 | 自動 | `npm run build` |
| 未確認情報の公開ブロック | 自動 | `【要確認】`が残る／停止中案件を参照 → ビルド失敗 |
| 薬機法・景表法NG表現の公開ブロック | 自動 | 「痩せる」系の断定・「最安」等 → ビルド失敗（`lib/load.mjs` の `NG_WORDS`） |
| 身バレ防止 | 自動 | 本名・施設名などのNGワード、画像の位置情報、メールアドレス掲載 → ビルド失敗 |
| 広告リンク死活・情報の鮮度（90日） | 自動（毎週月曜） | `npm run check`（GitHub Actions、失敗時はメール通知） |
| 公開 | 自動 | Vercel が main への push で再デプロイ |

## 匿名運営のための準備（最初に1回）
このフォルダを、本業と紐づかない別アカウントの非公開リポジトリへ移します。git の履歴ごと移すと、コミットに本業アカウントの名前やメールが残るので、**履歴は持っていかず新しく作り直します**。

1. 新しいメールアドレス（Gmail など）を作る。以下のサービスはすべてこのアドレスで登録する
2. そのアドレスで GitHub アカウントを作り、**Private** リポジトリを作る。ユーザー名には本名や本業を連想させる語を入れない
3. このフォルダだけをコピーし、新しい履歴で push する：
   ```bash
   cp -r affiliate ~/karada-site && cd ~/karada-site && rm -rf node_modules dist
   git init -b main
   git config user.name "（ハンドル名）"
   git config user.email "（新GitHubの noreply アドレス: 数字+ユーザー名@users.noreply.github.com）"
   git add . && git commit -m "init" && git remote add origin https://github.com/（新アカウント）/（リポジトリ）.git && git push -u origin main
   ```
4. Vercel も新しいアカウントで作る（プレビューURLにチーム名が入るため）。プロジェクト名にも本名は入れない
5. `private-words.example.txt` を `private-words.txt` にコピーし、本名・施設名・地元の地名などを書く（git には上がらない）。GitHub Actions でもチェックしたい場合は、リポジトリの Secrets に `PRIVATE_WORDS`（カンマ区切り）を登録して、ワークフローの `env` に渡す
6. 独自ドメインを取る場合は WHOIS 情報公開代行（お名前.com 等は無料）を必ずオンにする
7. Google アナリティクスや Search Console は新しいアカウントで登録する。本業サイトと同じ計測IDを使うと、IDの逆引きで同じ運営者だと分かってしまう
8. 写真は位置情報なしで書き出す（スマホのスクショ推奨）。店舗の外観や知人が写った写真は避ける

A8.net への本人登録（本名・住所・口座）は必須ですが、A8 にだけ届く情報でサイトには表示されません。サイト上の運営者名はハンドルネームで問題ありません。

## 初回セットアップ
1. A8.net で提携申請 → 承認された案件の広告リンク（テキストリンク）を `data/programs.json` に追加
   - `affiliateUrl`: `https://px.a8.net/svt/ejp?a8mat=...`
   - `impressionPixel`: 同じ広告コード内の `<img src="https://www**.a8.net/0.gif?a8mat=...">` の URL
   - 公式サイトで確認した料金・体験内容を記入し、`lastVerified` に確認日、`active: true`
2. `data/site.json` にハンドル名・問い合わせフォームURL（Googleフォーム等。メールアドレスは載せない）・公開URLを記入
3. Vercel（新アカウント）で新リポジトリを Import（ビルド設定は `vercel.json` で自動）
4. Google Search Console にサイトを登録し `sitemap.xml` を送信

下書きプレビュー: `npm run build:drafts` → `dist/` をブラウザで確認（noindex 付き。公開には使わない）。
下書き生成には `ANTHROPIC_API_KEY` が必要です。
