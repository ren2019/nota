# 乐谱页脚与来源排版验收

> 本文保留来源与页脚初版的验收证据。最新页脚将来源单独放在上层、日期/页码放在品牌层右侧，见[当前发布与验收](acceptance/current-release.md)。

对应 [GitHub issue #7](https://github.com/ren2019/nota/issues/7)。用户调用 implement-spec 后实施，范围仅为乐谱页脚与来源排版；#6 的应用界面走查另行跟踪。

代码基于全局简谱输出设置的 `4847ab1`，原集成分支为 `integration/export-footer-source`。实现提交 `ce242b3`，审查修复 `521fd03`，集成至 `25bc19d`。经用户批准，现已合入 main，正式部署未更新；最终品牌位置以后续 #8 为准。

## 实现结果

- 右下角统一显示 `Typeset with Nota`、准确 slogan `A simple way to make sheet music.`，以及启用的本地日期、多页页码；字号 7.5 pt，灰色。
- 左下角显示可读来源、版本及校对说明；缺失来源时留空。复用现有 `Song.meta` / `I:meta source`，支持 123 与 MusicXML 往返，没有新增来源管理界面或数据库。
- 对已核实的历史文字「单段旋律 · 依 AirDrop 原图校正」做精确兼容：从排版副标题移到页脚，原始可编辑文本保留。普通副标题、作曲者及其他历史曲谱不批量改写。
- 曲库的结构化来源只取 URL 与许可，不输出内部校验、哈希或其他技术信息；对应来源随页面提交保存，多曲同页汇总来源。
- PDF、PNG、PPTX 共用页脚文案、分栏、换行和底部留距。品牌开关同时控制品牌与 slogan；日期、页码独立，来源不受三个开关影响。没有新增 SVG 下载格式。
- 固定纸张的页脚最多占页高四分之一，过长来源末尾明确显示「…」，全文仍保存在原稿。连续长图保留全文并按需增长；小到容不下一行 7.5 pt 文字的自定义页面省略页脚。正常纸张不新增空白页。

## 自动验证

实施者使用独立 worktree 完成先红后绿；审查问题也由同一实施者以回归测试修复。集成后重新运行 `npm test` 全通过：包含 816 组转换，以及音高/音区、节奏、歌词、反复、原稿与 MIDI 不变的验证。

本轮新增覆盖：准确 slogan、左右对齐、开关组合、来源元数据往返、普通副标题与作者保留、多曲同页来源、真实 PPTX 序列化、四千字来源、极窄与短纸张边界。日期回归沿用本地日期计算及三个时区检查。

最终修复版本在独立 worktree 运行 `npm run build` 通过；只有既有的大块体积提示。`git diff --check` 通过。未在正式服务使用的根目录 `app/out/dist` 构建。

## Safari 实际成品验收

在隔离端口 5176、正式曲库的本地副本中操作；下载后渲染并目视核对，证据保存在忽略目录 `local/qa/footer-source/`。

| 场景 | 实际结果 | 本地证据 |
| --- | --- | --- |
| 莫斯科 A4 PDF / PNG | 来源小字靠左，品牌与 slogan 靠右；大副标题移除，曲名、作曲者、音符与歌词保留；仍为 1 页 | `moscow-after.pdf`、`moscow-after.png`、`moscow-footer.png` |
| 多页 PDF / PNG ZIP | 前后均 3 页；首页和末页目视检查，末页显示 `3 / 3`，未遮挡正文 | `multi-before.pdf`、`multi-after.pdf`、`multi-after.zip`、`multi-png/` |
| PPTX | 实际下载 3 张幻灯片；标题页及乐谱页显示两侧页脚，标题下不再显示历史来源说明 | `moscow-after.pptx`、`pptx-render/slide-01.webp`、`slide-02.webp` |
| 关闭品牌 | 品牌与 slogan 同时消失；来源、日期和 `1 / 3` 保留 | `brand-off.pdf`、`brand-off-footer.png` |
| 无来源 | 左侧留空，普通副标题和作者仍在，仍为 1 页 | `no-source.pdf`、`no-source.png` |
| 长来源与长 URL | 换行留在左栏，右侧品牌没有重叠，仍为 1 页 | `long-source.pdf`、`long-source.png` |
| 四千字来源 | 修复后正文正向、页脚在页面内，来源末行省略，仍为 1 页 | `extreme-source.pdf`、`extreme-source.png` |
| 连续长图 PNG | 通用导出菜单按当前长图版式导出，来源全文、品牌与日期均在底部，没有页码 | `long-image.png` |

练习面板的 PNG/PDF 快捷按钮会主动切换到 A4；连续长图通过「设置 → 版面 → 长图」及主「导出 → 简谱 PNG」验证。

验收后比对正式曲库原有 12 条文件的 SHA-256，全部未变。测试样谱仅写入隔离曲库。

## 两轴审查

- **Standards：0 项。** 已核对项目文档、模型投影、MusicXML 旁表、排版/导出边界及 i18n 约定。
- **Spec：1 项 P2，已修复。** 极长来源曾令固定纸张正文出现负缩放并把页脚排到页外。修复以固定页高度限制、明确省略号及连续长图完整保留处理，并覆盖真实 PPTX 输出边界。

完整审查与红绿日志见 `local/qa/footer-source/logs/`，集成测试日志为 `review-merge-tests.log`。

## 验证边界

本轮真实成品以简谱 PDF/PNG/PPTX 为主；其他输入来源及混排/五线谱路径由共享导出机制和既有自动回归覆盖，没有逐种重新做手工验收。PPTX 渲染环境提示缺少现有默认 Microsoft YaHei，预览使用字体替代；当前已查看页面的中文与页脚可读。未新增或宣称 SVG 下载能力；123、MusicXML 和 MIDI 保持数据导出用途，不添加可视页脚。未重新验收 iPhone/iPad PWA 音频。
