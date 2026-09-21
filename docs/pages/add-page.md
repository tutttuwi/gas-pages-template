---
title: ページの追加
order: 2
---

`docs/pages/` に Markdown を足すと、ビルド後のサイドバーに項目が増えます。

```yaml
---
title: ページタイトル
order: 3
---
```

`order` が小さいページほど上に並びます。`permalink` やタグは `docs/pages/pages.json` で共通設定しているので、各ファイルに書く必要はありません。
