---
title: 画像の埋め込み
order: 21
---

ローカル画像はビルド時に data URI として HTML へ埋め込まれます。パスは `docs/` からの相対で書きます。

![サンプル画像](assets/sample.svg)

`https://` で始まる画像はそのまま外部 URL として残ります。フッタ画像は `docs/_data/site.json` の `footerImage` です。
