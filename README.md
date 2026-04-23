# Original Index Tracker (Cloudflare Workers Edition)

Cloudflare D1 データベースと連携し、独自のカスタム株価指数をリアルタイムで追跡・分析するためのプラットフォームです。

## 特徴

- **ダイナミック計算**: 構成銘柄と比率を自在に設定し、独自指数を生成。
- **データ永続化**: Cloudflare D1 による安定したインデックス定義の管理。
- **モダンデザイン**: Outfit フォントを採用した、レスポンシブで洗練された UI/UX。
- **高パフォーマンス**: Cloudflare Workers + Vite による高速な配信と実行。

## システム構成

- **フロントエンド**: React + Vite (Vanilla CSS)
- **バックエンド**: Cloudflare Workers (TypeScript)
- **データベース**: Cloudflare D1
- **ホスティング**: Cloudflare Workers Static Assets

## ローカル開発

### 1. フロントだけ確認

```bash
npm install
npm run dev
```

### 2. build を作って Worker で確認

```bash
npm install
npm run build
npm run dev:worker
```

## 本番デプロイ

### 1. Cloudflare での準備
1.  Cloudflare Dashboard で D1 データベースを作成します。
2.  `schema.sql` を実行してテーブルを作成します。
    ```bash
    npx wrangler d1 execute original-stock-index-db --remote --file=schema.sql
    ```

### 2. GitHub Secrets の設定
GitHub Actions でCloudflare Workersに自動デプロイを行うため、以下の Secret を設定してください。

- `CLOUDFLARE_API_TOKEN`: Cloudflare の API トークン（Cloudflare Workers 編集権限）
- `D1_DATABASE_ID`: 作成した D1 データベースの ID (UUID)

## 主要ファイル

- `wrangler.jsonc`: Workers 設定（データベース ID は CI/CD で自動注入されます）
- `worker/index.ts`: API および静的配信のエントリポイント
- `src/lib/indexEngine.ts`: 指数計算ロジック（欠落データ対応済み）

## 開発上の注意

- **データ同期**: Yahoo Finance からの取得は 4 時間のキャッシュが効くように実装されています。強制的に更新したい場合は `/api/sync-prices` に `{ "force": true }` を送ってください。
- **セキュリティ**: ローカル環境でのDB更新を楽にするため、実際のデータベース IDを記述した`wrangler.local.jsonc` を任意で作成してください。これは git 管理外（`.gitignore`）に設定されています。

## ライセンス

MIT License
