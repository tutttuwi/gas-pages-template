# サイト共通データ定義

`site.json` の値が全ページ共通で使われます。`title` は見出しとブラウザタブ、`footerImage` はフッタ画像、`copyright` はフッタ文言です。

`theme.light` と `theme.dark` は配色です。キーは背景 `bg`、本文 `text`、補足 `muted`、アクセント `accent`、サイドバー `sidebar` / `sidebarText` / `sidebarMuted`、コードブロック `codeBg` / `codeText`、インラインコード `inlineCodeBg` です。公開ページの「システム / ライト / ダーク」切替は、未選択時は OS の設定に従い、選択後はブラウザに覚えます。
