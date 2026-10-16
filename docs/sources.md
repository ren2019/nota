# 来源与验证记录

## 需求来源

- [ChatGPT 分享对话：开源简谱转换方案](https://example.invalid/removed-private-discussion)

读取方式：remio `web_get` 仅返回部分消息，随后通过已登录 Edge 的分享页核对用户需求和助手回复。以用户后段对“歌词次要”“两种转换都需要”“设计应简化”的修正为准。

原图 `IMG_4549.png` 在对话中可见附件记录；尚未取得本地原始文件。对话里对该谱调号、分辨率与符号的描述属于前序分析，不能当作本次识谱实测。

## 候选项目

| 候选 | 源码 | 当前评估重点 |
| --- | --- | --- |
| 原琴简谱编辑器 | [StarryCosmosPiano/genshin-jianpu-editor](https://github.com/StarryCosmosPiano/genshin-jianpu-editor) | 现成编辑、两种转换与 PDF/PNG 导出 |
| Dolce | [lodebar2026/dolce](https://github.com/lodebar2026/dolce) | 简谱识别、原图校对、简谱记录及输出 |

本地参考源码位于 `.upstream/`，该目录已忽略。后续选定底座后再决定采用 fork、引入代码或其他复用方式，并保留相应许可。

## 初始化时的源码初查

本次参考版本：

- 原琴：`e1ab84b7d8957ed88ce61c6e1e233e76a09480d8`。
- Dolce：`2aab8ef2333ba9e1a2a7b342080381fcacdd41ac`。

以下结论来自静态阅读，尚未安装依赖或运行应用。

| 检查项 | 原琴 | Dolce |
| --- | --- | --- |
| 简谱图片识别 | `src/omr/index.ts` 提供本地识别、PaddleOCR、MusicXML 输出和识别叠加入口 | `src/omr/index.ts` 提供本地识别、PaddleOCR、转文档及识别叠加入口 |
| 实际移调 | `src/score/key-edit.ts` 的 `applyKeyChangeKeepingDegrees` 保留数字、八度和升降表示，调整区段内发声音高；已有 `key-edit-check.ts`，本次未运行 | `src/editor/visual/transpose.ts` 的 `transposeText` 对简谱改调号、保留唱名；MusicXML 另走模型转换 |
| 保持音高的重新记谱 | 本次检查的换调路径属于实际移调；尚未确认完整重新记谱路径 | 本次检查的简谱全曲移调属于实际移调；尚未确认完整重新记谱路径 |
| 纯简谱 PNG/PDF 入口 | `src/editor/export.ts` 的 `exportAllPagesPng`、`exportScorePdf` 及非混排导出菜单已有实现 | `src/editor/export.ts` 的 `EXPORT_ITEMS` 将 PNG/PDF 限定在 `isMixed`；纯简谱菜单未提供这两项 |
| 根许可 | MIT，保留原作与修改者署名 | MIT |

原琴 PDF 当前通过页面 SVG 光栅化生成；清晰度、A4 物理尺寸和中文字体表现尚未验证。Dolce 的导出限制针对上述版本的编辑器菜单，不代表仓库完全没有其他 PDF 生成能力。

初步顺序：优先运行原琴验证打印闭环，同时保留 Dolce 作为识别效果对照。当前没有足够实测证据确定最终底座。

可在 GitHub 按提交定位，例如[原琴换调实现](https://github.com/StarryCosmosPiano/genshin-jianpu-editor/blob/e1ab84b7d8957ed88ce61c6e1e233e76a09480d8/src/score/key-edit.ts)、[原琴导出实现](https://github.com/StarryCosmosPiano/genshin-jianpu-editor/blob/e1ab84b7d8957ed88ce61c6e1e233e76a09480d8/src/editor/export.ts)、[Dolce 移调实现](https://github.com/lodebar2026/dolce/blob/2aab8ef2333ba9e1a2a7b342080381fcacdd41ac/src/editor/visual/transpose.ts)、[Dolce 导出菜单](https://github.com/lodebar2026/dolce/blob/2aab8ef2333ba9e1a2a7b342080381fcacdd41ac/src/editor/export.ts)。

源码存在只说明有实现线索；图片识别准确率、移调正确性和打印质量需运行验证。根 MIT 许可也不代表各模型、字体及第三方模块的许可都已完成审查。

## 当前实现决定

用户随后指定在 Dolce 界面上开发 MVP；当前实现纳入 `app/`，以此决定覆盖先前“优先运行原琴”的探索顺序。上表保留为初始化时的静态核对记录。

Nota 已在 Dolce 上补充纯简谱 PNG/PDF 与两种转换；本次实现与验证状态见 [plan.md](plan.md)。
