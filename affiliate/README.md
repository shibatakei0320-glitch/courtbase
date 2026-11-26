# アフィリエイトサイト（スポーツ体験・登録型）

`data/programs.json`（案件）と `content/*.md`（記事）から静的サイトを生成します。依存なしの Node.js だけで動きます（下書き生成のみ Anthropic SDK を使用）。

## 自動化されていること / 人がやること

| 工程 | 担当 | コマンド |
|---|---|---|
| 記事の下書き作成 | Claude（自動） | `npm run draft -- --slug xxx --keyword "..." --programs id1,id2 --notes "現場メモ"` |
| 事実確認・体験談の追記・公開判断 | **人** | 記事の `【要確認】` `【体験談を追記】` を埋めて `status: published` |
| PR表記・`rel="sponsored"`・比較表・サイトマップ・運営者情報 | 自動 | `npm run build` |
| 未確認情報の公開ブロック | 自動 | `【要確認】`が残る／停止中案件を参照 → ビルド失敗 |
| 広告リンク死活・情報の鮮度（90日） | 自動（毎週月曜） | `npm run check`（GitHub Actions、失敗時はメール通知） |
| 公開 | 自動 | Vercel が main への push で再デプロイ |

## 初回セットアップ
1. A8.net で提携申請 → 承認された案件の広告リンク（テキストリンク）を `data/programs.json` に追加
   - `affiliateUrl`: `https://px.a8.net/svt/ejp?a8mat=...`
   - `impressionPixel`: 同じ広告コード内の `<img src="https://www**.a8.net/0.gif?a8mat=...">` の URL
   - 公式サイトで確認した料金・体験内容を記入し、`lastVerified` に確認日、`active: true`
2. `data/site.json` の運営者名・連絡先・公開URLを記入（A8 の審査・規約上も運営者情報は必要）
3. Vercel で同じリポジトリを **別プロジェクト** として Import → Root Directory を `affiliate` に設定（ビルド設定は `vercel.json` で自動）
4. Google Search Console にサイトを登録し `sitemap.xml` を送信

下書きプレビュー: `npm run build:drafts` → `dist/` をブラウザで確認（noindex 付き。公開には使わない）。
下書き生成には `ANTHROPIC_API_KEY` が必要です。
