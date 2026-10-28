# 当前状态与后续计划

2026-10-28 更新。任务状态以 [GitHub Issues](https://github.com/ren2019/nota/issues) 为准；本文提供导航，不维护第二套任务清单。

## 当前可用

独立 CLI、配套 skill 与运行实例的检查、新建、按版本更新、原图局部同步及软删恢复见 [工具说明](agent-tools.md)。本机 SkillFlow/Codex、真实 HTTPS 机器入口和同实例网页实测范围见 [验收记录](acceptance/agent-library.md)，执行状态以 [#23](https://github.com/ren2019/nota/issues/23) 为准。

## 2026-10-16 交付记录

B 单曲详情双态、L1 紧凑首页、完整 Dolce 独立编辑页、保存入库、播放/阅读、调式、紧凑导出、曲谱管理和中文联网查谱均已合入 main 并上线。该轮发布功能版本为 `71a61a7`，包含追加修复与手机底栏留白；正式入口主流程冒烟通过。用户此前确认 iPhone 添加到主屏幕后能独立启动、打开曲谱。发布修复及证据边界见[当前发布与验收](acceptance/current-release.md)。

## 2026-10-16 追加验收与发布收口

本轮追加修复及底栏微调已合入 main，并按用户最新部署指令发布。用户要求以浏览器自动化完成原先请求的逐项操作，本轮据此验收，不再安排人工补测；#9、#11、#19 已关闭，当轮收口时 tracker 没有开放任务。

- [#11 完整 Dolce 编辑页](https://github.com/ren2019/nota/issues/11)：57 组实际 App 自动操作，补齐原能力逐组证据并修复内联编辑焦点问题；入口、格式、平台和边界见[对照表](acceptance/dolce-editor-parity.md)。
- [#19 整合与设备验收](https://github.com/ren2019/nota/issues/19)：Chromium 桌面与 WebKit iPhone 浏览器参数下各 18 条真实 App 旅程、实际导出及真实播放证据；故障、管理、新图片、查谱异步闭环已有回归。系统键盘、Files、锁屏 / 杀进程及 Android 真机不伪造为通过，只保留证据边界。
- [#9 父规格](https://github.com/ren2019/nota/issues/9)：实施、上述自动验收及最终审查已收口；生产主流程冒烟通过。真机此前确认的主屏幕启动、开谱和登录保持继续有效。

详细结果与可重跑命令见[追加复验](acceptance/nota-ia-followup.md)，生产冒烟见[发布记录](acceptance/current-release.md)；不将历史未执行项改写成当时通过。

## 能力限制与后续候选

- 真实照片的整谱自动识别准确性仍未通过；原图校对与人工纠错继续保留。
- 《莫斯科郊外的晚上》已修复旧项目恢复问题；四段歌词、全部房号和演唱次序的完整原稿验收仍有独立边界，不能与恢复修复混为一谈。
- 多声部旋律提取、和弦名称移调及其他识谱改进需另定范围，不属于本轮 IA 清理。

早期阶段计划已冻结到[历史 MVP 计划](history/mvp-plan.md)。个人实例的部署配置、网关和其他站点运维记录仅存于 `local/` 或独立运维项目，不进入公开产品任务。

## 2026-10-22 开源准备

Web 源码准备与验收见 [#20](https://github.com/ren2019/nota/issues/20)；保留 Dolce 字形和 OCR 模型，来源与证据边界见 [资源清单](../app/THIRD_PARTY_ASSETS.md)。本轮 Web 优先，Tauri 桌面发行延期，原生依赖与平台验收跟踪 [#21](https://github.com/ren2019/nota/issues/21)。具体状态以 GitHub 为准。
