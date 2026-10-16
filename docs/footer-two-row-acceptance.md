# 两行页脚与图形标志验收

对应 [GitHub #8](https://github.com/ren2019/nota/issues/8)，作为 #7 完成后的后续排版调整。用户已确认验收方式并调用 implement-spec 授权实施。

基线 `c4ca56a`，实现 `b3b9f0d`，集成 `16da9d5`，最终图形位置调整 `8be6505`；原集成分支为 `integration/footer-two-row`。经用户批准，现已合入 main，合入后 `npm test` 通过；正式部署未更新。#6 的其他 UI 事项不在本轮范围。

## 实现

- 第一行左侧来源，右侧本地导出日期和多页页码；使用实际日期/页码宽度留位，普通来源与日期共用基线。
- 第二行全宽靠左，从与来源相同的左边界开始：`Typeset with [单色图形] Nota · A simple way to make sheet music.`。字号 7.5 pt、灰色，图形两侧留距，与文字视觉对齐。
- 图形取自现有 Nota 音符/N 标志，无彩色底板。共享矢量几何内嵌于 SVG 页面与 PPTX，不依赖联网、额外字体或新依赖。
- 三个设置及其持久化值保留；品牌统一控制图形、署名和 slogan。关闭品牌收起整行；信息区为空时也收起空行；全无内容时不增加页脚。
- 长来源信息区可以换行，品牌始终在信息区之后；固定纸张保留高度上限及明确省略号，连续长图保留全文。未改曲谱模型、来源提取、原稿、转换和试听逻辑。
- 用户署名只留上下文扩展说明，无输入、自动读取或持久化功能。

主要修改：共享页脚模块负责两层布局、间隔、边界和 SVG 图形；新增标志几何模块，供 SVG/PPTX 共用；PPTX 适配器输出相同标志。更新现有页脚、设置、真实排版/PPTX 回归和导出模块文档。

## 自动验证与审查

- 实施者在独立 worktree 使用 TDD 完成文字、布局和矢量输出的红绿回归，日志保存在 `local/qa/footer-two-row/logs/`。
- `npm test` 全通过：816 组转换及既有原稿、音高、音区、节奏、歌词、反复、MIDI 和 MusicXML 保真回归；新增 8 种开关组合的真实 PPTX 内容、图形、位置与空行收起检查。
- 独立 worktree 的 `npm run build`、集成后的 `npm test` 和 `git diff --check` 通过。构建只有既有的大块体积提示；未在正式服务使用的根目录 `app/out/dist` 构建。
- Asia/Shanghai、America/Los_Angeles、Pacific/Kiritimati 的本地日期与午夜边界检查通过，日志 `timezones.log`。
- **Standards：0 项发现。** 共享几何、导出适配、原稿边界符合项目规范，无额外重构要求。
- **Spec：0 项发现。** 两层布局、来源保真、空行收起、同源矢量及安全规则均已核对；审查另抽查 1,344 组来源、尺寸及开关组合，边界和正向缩放通过。

## Safari 实际导出

使用隔离端口 5176 及正式曲库副本操作，下载后渲染、目视检查。真实曲谱、导出件和审查日志均在忽略目录 `local/qa/footer-two-row/`，未随仓库上传。

| 场景 | 实际检查结果 | 证据 |
| --- | --- | --- |
| 莫斯科 PDF/PNG | 1 页；首行来源左、日期右，次行图形/品牌/slogan 左；曲名、作者、音符、歌词及反复保留 | `moscow.pdf`、`moscow.png`、`moscow-footer.png` |
| 多页 PDF/PNG ZIP | 3 页，与既有验收页数一致；包内 3 张 PNG，首末页页脚完整、末页 `3 / 3`，无空白页 | `multi.pdf`、`multi.zip`、`multi-png/` |
| 莫斯科 PPTX | 3 张幻灯片；标题页与乐谱页的品牌图形及文字正常，首行来源和日期/页码分区，次行靠左 | `moscow.pptx`、`pptx-render/` |
| 品牌关闭 | 图形、署名和 slogan 整组消失，来源与日期/页码保留，品牌空行收起 | `brand-off.pdf`、`brand-off-footer.png` |
| 日期关闭 | 日期消失，右侧 `1 / 3` 独立保留，品牌行仍可见 | `date-off.pdf`、`date-off-footer.png` |
| 无来源 | 左侧无伪造来源/用户名，普通副标题及作曲者保留，1 页 | `no-source.pdf`、`no-source.png` |
| 长来源及长 URL | 充分利用首行剩余宽度换行，不与日期或品牌重叠，1 页 | `long-source.pdf`、`long-source.png` |
| 四千字来源 | 固定纸张以省略号截短，品牌行仍完整、正文正常，1 页 | `extreme-source.pdf`、`extreme-source.png` |
| 连续长图 | 通用 PNG 导出保留来源全文，品牌在来源下方靠左，日期在信息区右侧，无页码 | `long-image.png` |
| 真实 MusicXML 五线谱/混排 | 已有《国际歌》副本，两种 PDF 均 2 页；实查续页完整音符及页脚，来源和 `2 / 2` 正常；同时下载 PNG 检查同一路径 | `staff-real.pdf`、`mixed-real.pdf`、`staff-real.png`、`mixed-real.png`、`staff-real-footer.png`、`mixed-real-footer.png` |

最初用于坐标检查的最小合成 MusicXML 只显示空小节，未将其作为完整五线谱成品通过的证据；随后换用真实曲谱检查。

实际下载后比对正式曲库 12 条记录的 SHA-256，全部未变。新增验收样谱只写入隔离曲库。

## 边界

未在本轮实测 iPhone/iPad PWA 或 Tauri 原生导出；桌面 Safari 结果不代替这些设备的实测。未修改手机界面或下载入口。PPTX 预览器提示现有默认 Microsoft YaHei 缺失并使用替代字体，已查看页面的中文、标志与页脚可读。没有新增 SVG 下载格式；123、MusicXML、MIDI 等数据导出不添加可视品牌页脚。未开发用户名功能。

## 后续：图形移到 Nota 前

用户后续指定图形放在产品名称前面。品牌行调整为 `Typeset with [图形] Nota · A simple way to make sheet music.`，保留整组靠左，图形两侧留距；窄页将图形和 Nota 一起换行。更新共享布局及真实 PPTX 位置回归，不更改曲谱或图形几何。

测试、构建和差异检查通过。Safari 重新下载莫斯科 PDF、PNG 与 PPTX，页脚位置、留距正常，PDF 仍为 1 页。证据在 `local/qa/footer-logo-position/`。

资源现状已核实：PDF/PNG/PPTX 共用导出图形定义，但这份几何是从 favicon 提取的静态副本，替换应用 favicon 不会自动更新导出图形；已导出的文件也不会追溯更新。本轮仅调整位置，没有实现应用图标与导出图形的自动同步。
