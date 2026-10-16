# 全局简谱输出设置验收

> 本文为全局输出设置的阶段验收证据，已合入并上线；当前版本及剩余验收见[当前发布与验收](acceptance/current-release.md)。

2026-10-16；规格与状态以 [GitHub #1](https://github.com/ren2019/nota/issues/1) 及子任务 #2–#5 为准。原集成分支为 `integration/global-jianpu-output`；经用户批准，现已合入 main，正式部署未更新。

## 已实现

- 设置 → 简谱输出：逐音明确标注（默认）与小节内延续，两组短例子；即时预览，确认持久化，取消恢复。非法或不可读设置回退默认。
- 当前浏览器/PWA 的所有曲谱共用偏好；不写入家庭服务器配置，不自动保存曲谱。
- 123、JPWABC、文本谱、ABC、MusicXML 等现有来源的简谱投影，以及原样、展开、混排中的简谱层，使用同一输出策略。
- PDF、PNG、连续长图、多页 PNG 包及 PPTX 接入同一模式；多页异步图形导出先捕获完整页面，避免中途切换混用设置。
- 新增「导出 → 123 简谱文本（按输出设置）」，跨格式另存／格式切换到 123 也复用此策略。原格式保存保持原稿；已有能力损失检测与原生来源语义重读保护继续生效。
- 两种练习转换读取当前模式；修复变音倚音错误影响后续主音的情况。
- 练习谱记住最后明确选择的 16/20/24 pt；无明确选择时保留用户已有字号。自定义 22 pt 仍可沿用，A4 快捷版不重置它。
- 新设置中的三个页脚开关与原快捷入口共用原配置，保留本地日期和多页页码规则。

## 主要文件

| 范围 | 文件 |
| --- | --- |
| 输出策略、文本保护、转换 | `app/src/nota/jianpu-output.ts`、`text-output.ts`、`convert.ts` |
| 设置和持久化 | `app/src/editor/settings.ts`、`dialogs.ts`、`app.ts`、`app/src/nota/panel.ts` |
| 共用页脚控件 | `app/src/nota/footer-controls.ts`、`footer-settings.ts` |
| 多来源、混排与导出 | `app/src/layout/painter.ts`、`jianpu/compose/marks.ts`、`app/src/editor/mixedsession.ts`、`export.ts`、`formatswitch.ts` |
| 音乐语义与原生布局 | `app/src/model/jianpu.ts`、`xmlsurface.ts` |
| 界面文案、回归和模块说明 | `app/src/i18n/{zh,en}.ts`、`app/src/nota/*.check.ts`、原有 `app/scripts/nota-check.mjs`、`app/docs/模块/` |

## 自动验证

最终合入代码 `68aae39`：根目录 `npm test` 全通过。包括两模式共 816 组转换，以及来源投影、实际 ScorePainter、PPTX 矢量序列化、123 往返、设置迁移、播放、原始 XML/MIDI 和服务测试。构建在独立工作树执行，TypeScript 与 Vite 通过，未覆盖正式静态目录。Vite 仍有既有大 chunk 提示。

真实库中《莫斯科郊外的晚上》41 音保持音高重记到 C：逐音模式开头 `1 ♭3 5 ♭3`；延续模式 `1 ♭3 5 3`。逐音音高均不变，第四音均为 E♭4（MIDI 63）；两种 123 输出重读一致。正式曲库原有 11 份文件内容哈希保持不变。验收期间库中另有一份新增《星条旗 · 美国国歌》记录，未改动该记录。

## 实际 Safari 和成品检查

在隔离 QA 服务与独立曲库副本完成原生 Safari 操作，未写正式曲库。

| 场景 | 实测结果与本地证据 |
| --- | --- |
| 两模式即时切换、取消、确认、刷新 | 符号实时变化；取消恢复；源码比较相同；确认后刷新仍记住模式。 |
| 原有字号及页脚 | 22 pt → A4 仍为 22；明确选特大后刷新、打开另一首仍记住；旧入口关日期，新入口读到关闭；新入口恢复，旧入口读到开启；取消不写。 |
| 真实莫斯科重记与文本下载 | 两模式分别转换、实际下载 `.123`；切换显示设置没有改写编辑源码；逐音 PDF 已渲染核对。`moscow-{explicit,measure}.123`、`moscow-explicit.pdf`。 |
| 单页 PDF/PNG | 两模式实际下载，降／升／必要还原号正确。`explicit.{pdf,png}`、`measure.{pdf,png}`。 |
| 多页 A4 PDF/PNG 包 | 三页 A4，ZIP 对应三张图；第一页及末页已目视，记号、八度点和页脚无重叠，无额外空白页。`multi-explicit.pdf`、`multi-explicit.zip`。 |
| 连续长图 | 实际下载 1772×14595 PNG，所有行和底部署名／日期完整，无页码。`long-explicit.png`。 |
| 原生来源及混排 | Safari 检查 ABC 展开、JPW 原样、文本夹层及原生 XML 倚音／和弦混排。混排和弦末音必需降号恢复，PDF 实际下载并渲染。`chord-mixed.pdf`。 |
| PPTX | 两模式实际下载并经 remio 原生引擎渲染：谱面分别为 `1 ♭3 5 ♭3` / `1 ♭3 5 3`，页脚一致。原有展开档标题页保留。`abc-{explicit,measure}.pptx`、`pptx-{explicit,measure}/`。 |
| 有损保护 | XML 休止符歌词尝试 123 下载，明确提示「挂在休止符上的歌词」，保留原格式；没有生成丢失歌词的文本。 |

以上成品、测试日志及哈希证据在忽略目录 `local/qa/global-output/`，不上传真实曲谱／原图。

## Standards

初次审查发现两项：混排复制丢失 XML 原文旁表，以及新增测试 runner 不符合现有目录约定。已由同一修复实现者处理：克隆继承所有原文旁表槽位；实际混排验证小节宽度、符干、歌词字体及原稿不变；新 runner 并入既有入口。未留下未处理发现。

## Spec

初次审查发现两项：隐藏和弦内音污染主旋律记号延续，以及 123 下载未完整复用已有损失检测。已补最小红绿回归并修复；Safari 验证末音降号和休止歌词拒绝。未发现范围扩张，未留下未处理发现。

## 边界

本轮浏览器实测为 macOS Safari；未再次在实体 iPhone/iPad PWA 操作。偏好只在各浏览器/PWA 自身存储范围持久化。PPTX 渲染器提示本机未装 Microsoft YaHei，可能替换字体；本轮英语样谱及音符矢量渲染正常。没有新增独立 SVG 导出；jianpu-ly 仍沿用原单向文本导出约定，不作为分页简谱图形格式处理。图像识谱完整准确性仍未通过原先的两张照片验收，不属于本规格。
