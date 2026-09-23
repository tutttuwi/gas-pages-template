# gas-pages-template

`docs/` の Markdown を 11ty で1つの HTML にまとめ、Google Apps Script の Web アプリとして公開するためのテンプレートです。パッケージ管理は pnpm を使います。

## 必要なもの

- Node.js と [pnpm](https://pnpm.io/)
- [clasp](https://github.com/google/clasp)（`pnpm` の devDependency に含まれます）
- Google アカウント（[Google Apps Script API](https://script.google.com/home/usersettings) をオンにする）

## 使い方

```sh
pnpm install
pnpm dev      # http://localhost:8080 でプレビュー
pnpm build    # dist/ に index.html と GAS ファイルを出力
```

初回だけ、Google Apps Script プロジェクトを用意して `.clasp.json` の `scriptId` を書き換えます。その前に、`clasp login` するのと同じ Google アカウントで [Google Apps Script API](https://script.google.com/home/usersettings) をオンにしてください。オフのままだと、ビルドは通っても `clasp push` が次のエラーで止まります。

```
User has not enabled the Apps Script API.
Enable it by visiting https://script.google.com/home/usersettings then retry.
```

オンにした直後は反映に数分かかることがあります。別アカウントで設定画面を開いていると有効にならないので、ログインアカウントと揃えてください。

```sh
pnpm exec clasp login
pnpm exec clasp create --type webapp --title "gas-pages" --rootDir dist
```

`clasp create` が `scriptId` を書いてくれます。既存プロジェクトを使う場合は、`.clasp.json` の `YOUR_SCRIPT_ID` を差し替えてください。

コードだけ更新する場合は `pnpm push` です。`pnpm push` と `pnpm run deploy` は `clasp push --force` を使うので、マニフェスト更新の確認（`Do you want to push and overwrite?`）は出さず、ローカルの `appsscript.json` でリモートを上書きします。Web アプリのデプロイ版を更新する場合は `pnpm run deploy:latest` です。`clasp deployments` の一覧から直近の Deployment ID（バージョン番号が最大のもの。バージョンが無い場合は一覧の末尾）を `DEPLOYMENT_ID` に入れて `pnpm run deploy` します。ID を自分で指定する場合は、`pnpm exec clasp deployments` で確認してから環境変数を付けて実行します。未設定やプレースホルダのまま `pnpm run deploy` すると、意図しない新規デプロイを作らないよう途中で止まります。

```sh
pnpm run deploy:latest
# または
pnpm exec clasp deployments
DEPLOYMENT_ID=AKfycb... pnpm run deploy
```

## ページの追加

`docs/pages/` に Markdown を追加します。Front Matter の `title` と `order` がサイドバーのラベルと並び順になります。詳細は `docs/README.md` を見てください。

配色は `docs/_data/site.json` の `theme` です。項目の意味と「システム / ライト / ダーク」切替は `docs/_data/README.md` を見てください。

## フォーム回答の Slack 通知

Google フォーム側に GAS は置きません。回答先スプレッドシートの新しい行を、この Web アプリが定期チェックして Incoming Webhook へ送ります。

1. フォームの回答をスプレッドシートへリンクする
2. Slack Incoming Webhook を発行する
3. デプロイした Web アプリの「通知ルール」で宛先と監視ルールを保存する
4. 「トリガー」で間隔を選んで定期チェックを有効にする

通知文は `{{列名}}` でカスタマイズできます。ルール保存時の既存行は既読になり、それ以降の増分だけが送られます。

この機能ブランチを試すときは、既存の GAS プロジェクトを上書きしないよう、`clasp create` で別プロジェクトを作って `.clasp.json` の `scriptId` を切り替えてください。
