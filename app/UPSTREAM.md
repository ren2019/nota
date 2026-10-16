# Dolce 基础应用

Nota MVP 基于 [lodebar2026/dolce](https://github.com/lodebar2026/dolce) 的提交 `2aab8ef2333ba9e1a2a7b342080381fcacdd41ac`（上游版本 0.8.3）。采用 Dolce 是用户在 2026-10-16 明确指定的实现方向。

本目录复制了该版本的源码、静态资源、锁文件和文档，未携带上游 Git 历史。根 [LICENSE](LICENSE) 与资源中的第三方许可保持原样。

Nota 的新增内容集中在 `src/nota/`，入口连接位于 `src/main.ts`、`index.html`，简谱 PNG/PDF 导出扩展位于 `src/editor/export.ts`。家庭曲谱库位于 `src/nota/library.ts` 与 `server/library.mjs`，入口保存行为扩展位于 `src/editor/app.ts`。原界面品牌已改为 Nota，页面底部保留 Dolce 来源链接。`scripts/nota-check.mjs` 运行转换回归。

上游 [README.md](README.md) 描述 Dolce 本身；Nota 的运行方式和当前能力以仓库根 README 为准。
