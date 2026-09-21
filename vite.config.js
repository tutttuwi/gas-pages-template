import { defineConfig } from "vite";
import viteSingleFile from "vite-plugin-singlefile";
import { resolve } from "path";

export default defineConfig({
  rott: "src",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  plugins: [viteSingleFile()],
  // ビルド時にMarkdownファイルを含める
  assetsInclude: ["**/*.md"],
});
