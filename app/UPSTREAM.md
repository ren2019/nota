# Dolce 基础应用

Nota MVP 基于 [lodebar2026/dolce](https://github.com/lodebar2026/dolce) 的提交 `2aab8ef2333ba9e1a2a7b342080381fcacdd41ac`（上游版本 0.8.3）。采用 Dolce 是用户在 2026-10-16 明确指定的实现方向。

本目录复制了该版本的源码、静态资源、锁文件和文档，未携带上游 Git 历史。根 [LICENSE](LICENSE) 与资源中的第三方许可保持原样。

Nota 的新增内容集中在 `src/nota/`，入口连接位于 `src/main.ts`、`index.html`，简谱 PNG/PDF 导出扩展位于 `src/editor/export.ts`。共享曲谱库位于 `src/nota/library.ts` 与 `server/library.mjs`，入口保存行为扩展位于 `src/editor/app.ts`。原界面品牌已改为 Nota，页面底部保留 Dolce 来源链接。`scripts/nota-check.mjs` 运行转换回归。

上游 [README.md](README.md) 描述 Dolce 本身；Nota 的运行方式和当前能力以仓库根 README 为准。

## 分发资源与 Nota 修改

字形字典 `src/staffomr/lyricglyphs.json`、`glyphmap.json` 沿用上述固定提交，未替换；这记录来源与上游代码许可，不额外声称第三方字体或曲谱授权已经独立核实。模型同样从固定上游携带，逐文件哈希和已知转换信息见 [资源清单](THIRD_PARTY_ASSETS.md)。

Nota 将裁剪字体更名为 Nota Chord Symbols，并补全 OFL、原始归属和修改记录；宣传截图改为合成练习谱。上游原始桌面构建不属于本轮 Web 发行支持范围。
