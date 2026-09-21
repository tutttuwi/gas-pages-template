# docsフォルダの使い方

このフォルダの Markdown がビルド時に1つの `index.html` にまとめられ、GAS で公開されます。

## 新規ページの追加方法

1. `docs/pages/` に `.md` ファイルを作成する
2. Front Matter に `title`（必須）と `order`（並び順、小さいほど上）を書く

個別 HTML は出力されません。本文中の画像は `docs/` からの相対パス（例: `assets/sample.svg`）で参照すると、ビルド時に HTML へ埋め込まれます。
