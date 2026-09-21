# gas-pages-template

`docs/` の Markdown を 11ty で1つの HTML にまとめ、Google Apps Script の Web アプリとして公開するためのテンプレートです。パッケージ管理は pnpm を使います。

## 必要なもの

- Node.js と [pnpm](https://pnpm.io/)
- [clasp](https://github.com/google/clasp)（`pnpm` の devDependency に含まれます）
- Google アカウント

## 使い方

```sh
pnpm install
pnpm dev      # http://localhost:8080 でプレビュー
pnpm build    # dist/ に index.html と GAS ファイルを出力
```

初回だけ、Google Apps Script プロジェクトを用意して `.clasp.json` の `scriptId` を書き換えます。

```sh
pnpm exec clasp login
pnpm exec clasp create --type webapp --title "gas-pages" --rootDir dist
```

`clasp create` が `scriptId` を書いてくれます。既存プロジェクトを使う場合は、`.clasp.json` の `YOUR_SCRIPT_ID` を差し替えてください。

コードだけ更新する場合は `pnpm push` です。Web アプリのデプロイ版を更新する場合は、`pnpm exec clasp deployments` で ID を確認し、環境変数 `DEPLOYMENT_ID` を付けて実行します。未設定やプレースホルダのまま `pnpm run deploy` すると、意図しない新規デプロイを作らないよう途中で止まります。

```sh
pnpm exec clasp deployments
DEPLOYMENT_ID=AKfycb... pnpm run deploy
```

## ページの追加

`docs/pages/` に Markdown を追加します。Front Matter の `title` と `order` がサイドバーのラベルと並び順になります。詳細は `docs/README.md` を見てください。
