# MVP 实施与验证

## 当前决定

用户明确要求在 Dolce 界面上增加功能，先交付可运行的 MVP prototype。停止以候选选型为开发前置条件。底座版本和许可见 [../app/UPSTREAM.md](../app/UPSTREAM.md)。

## 已实现

- [x] Dolce 应用纳入 `app/`，通过根目录命令安装、启动和构建。
- [x] 保留上游导入、校对、源码/谱面编辑、试听、保存和视图切换。
- [x] 新增练习谱面板，明确区分实际移调与保持音高重新记谱。
- [x] 12 种目标基准、转换说明和最近一次转换的精确原文还原。
- [x] A4 黑白练习版，16/20/24 pt 数字，PNG 与 PDF 导出；多页 PNG 打包 ZIP。
- [x] 内置降 E 基准的《小星星》，可直接对比两种转换。

## 验证

- `npm test`：408 组转换通过，覆盖音高、八度、节奏、休止符、歌词、临时升降号、倚音、三连音、曲中换调和反复结构。
- `npm run build`：TypeScript 与 Vite 构建通过。
- Edge 实际操作：示例加载、实际移调、音高保持的重新记谱及 PDF/PNG 下载均已执行。
- 长谱导出实测：PDF 为两页，每页 595×842 pt；ZIP 内包含对应两页 PNG。
- 下载 PDF 已通过 remio 读取；页面尺寸 595×842 pt。下载 PNG 为 2479×3508 像素，已目视核对中文、降号、八度点、小节线与歌词，编辑用换行标记未带入输出。QA 文件在忽略目录 `local/qa/`。

## 现在可以试的路径

启动后点「查看示例乐谱」，先选「保持音高，重新记谱」到 C；可看到原来的 `1 1 5 5` 改为 `b3 b3 b7 b7`（练习谱逐音明确标记升降号）。点「还原转换」，改试「实际移调」到 C，数字关系保留，声音下降三个半音。可继续修改谱面并导出。

## 家庭共用与部署（追加需求，已完成）

- [x] Nota 自有 SVG Logo、产品名、页签、应用清单；底部 Dolce 署名。
- [x] 创作区下方曲谱库，搜索曲名/调号，新建空白谱，保存、更新、另存与重新打开。
- [x] 曲谱库落盘在 Mac mini，识谱作品连原图与校对状态保存。
- [x] 发布正式构建到用户 LaunchAgent，局域网 IP 与本地域名均可访问。
- [x] 重启正式服务，两份曲谱内容完整保留；用户故事逐项验收见 [acceptance.md](acceptance.md)。

维护与备份见 [deployment.md](deployment.md)。

## 品牌、页脚与初始曲谱（已实现）

- [x] 首页 Nota 与准确官方 Slogan。
- [x] 集中的导出页脚文案、日期、页码与三个默认开启的开关。
- [x] 简谱/五线谱 PDF、PNG 以及 PPTX 接入同一页脚规则；没有新增 SVG 下载格式。
- [x] 单页、多页输出实际下载和目视检查，三个时区日期回归。
- [x] Safari 添加到程序坞并从独立 Nota App 启动、上传、编辑、下载。
- [x] 指定九首曲谱入库及来源记录；Safari App 逐首打开验证。
- [x] 修复相邻三连音多出兜底“6”括号的版面投影问题，不改输入模型。

## 后续

- 已取得两张 AirDrop 原图并实际识别；自动识别准确性未通过，详见 [acceptance.md](acceptance.md)，不能把人工校正稿冒充自动通过。
- 完成《莫斯科郊外的晚上》四段歌词、全部房号与反复演唱次序的完整原稿验收；库中先保留已校正的单段练习版。
- 用实际曲谱反馈调整面板和打印版式。
- 按需补旋律声部提取、和弦名称移调，并收集真实手机使用反馈。

当前已以真实原图发现 OMR 错误，尚未达到自动逐音全对。转换范围和具体限制以根 README 为准。

## 2026-10-16 新增探索检查点

两个独立 issue 的 spike 已完成，用户随后明确批准合入：[NOTA-001](issues/001-omr-octave.md)、[NOTA-002](issues/002-structured-score-import.md)。最小实施已接入并部署，详见 [本轮接入记录](integration-2026-10-16.md)。新增 iOS 媒体音频会话、中断恢复、局部八度点复核和结构化来源候选；用户已实测 Safari PWA 播放正常，图像识谱完整准确性依旧未通过。

《莫斯科郊外的晚上》保持音高重记的重复升降号已改为逐音显式显示，保留必要还原号与原有音高。复现、原因及验证边界见 [NOTA-003](issues/003-renotation-accidentals.md)。

## 全局简谱输出设置（已在集成分支完成）

全局简谱输出设置及两种升降号模式已按 [GitHub issue #1](https://github.com/ren2019/nota/issues/1) 完成，代码位于 `integration/global-jianpu-output`。两轴审查发现已修复；测试、构建及 Safari 实际导出通过，详见 [验收记录](global-jianpu-output-acceptance.md)。本次未合入 main 或更新正式部署，后续状态以 GitHub Issues 为准。

## 乐谱页脚与来源排版（已在集成分支完成）

[GitHub issue #7](https://github.com/ren2019/nota/issues/7) 已实现：底部右侧品牌与官方 slogan，左侧小字来源；保留原稿、普通副标题和作曲者。两轴审查完成且发现已修复，测试、构建与 Safari PDF/PNG/PPTX 实际验收通过，详见 [验收记录](export-footer-source-acceptance.md)。代码位于 `integration/export-footer-source`，未合入 main 或更新正式部署；#6 的应用界面走查另行跟踪。

## 两行页脚与图形标志（已在集成分支完成）

[GitHub issue #8](https://github.com/ren2019/nota/issues/8) 按用户后续决定调整为：首行来源左、日期/页码右，次行图形标志、署名与 slogan 靠左。保留三开关及长来源保护，两轴审查无发现，测试、构建及 Safari 实际导出通过。代码位于 `integration/footer-two-row`，详见 [验收记录](footer-two-row-acceptance.md)；本轮未合入 main 或更新正式部署。
