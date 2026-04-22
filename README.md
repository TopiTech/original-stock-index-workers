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

```bash
npm install
npm run deploy
```

## 主要ファイル

- `wrangler.jsonc`: Workers 設定
- `worker/index.ts`: `/api/*` と静的配信のエントリ
- `src/`: Vite フロント

## 補足

- SPA ルーティングのため `wrangler.jsonc` の `assets.not_found_handling` は `single-page-application` にしています。
- `/api/*` は Worker が処理し、それ以外は `ASSETS` 経由で `dist` のファイルを返します。
