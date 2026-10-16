# 文档导航

产品使用从[根 README](../README.md)开始。规格、任务和状态统一在 [GitHub Issues](https://github.com/ren2019/nota/issues) 维护；历史文档中的“待实施”“未部署”和测试数量只代表记录时点。

## 当前说明

| 文档 | 用途 |
| --- | --- |
| [当前发布与验收](acceptance/current-release.md) | 已上线版本、用户确认、仍缺少的证据 |
| [后续计划](plan.md) | 剩余验收与下一步入口 |
| [部署与备份](deployment.md) | 完整服务、HTTPS、入口鉴权、macOS 常驻和手机安装 |
| [需求与边界](brief.md) | 两种转换语义、实例共享与范围限制 |
| [领域术语](../GLOSSARY.md) / [单实例 ADR](adr/0001-self-hosted-shared-instance.md) | 统一术语与架构决定 |
| [初始曲谱来源](library-seed.md) | 曲谱版本、来源和种子导入边界 |

## 验收证据

- [IA 追加复验](acceptance/nota-ia-followup.md)：候选集成的双引擎旅程、真实输出与音频、手机参数和自动化边界。
- [IA 整合验收](acceptance/nota-ia-spec-9.md)：分层记录自动测试、浏览器、成品及设备证据，保留未验项。
- [完整 Dolce 功能对照](acceptance/dolce-editor-parity.md)：固定上游版本、原入口和实际操作覆盖。
- [IA 代码审查](acceptance/nota-ia-review.md)：审查发现及修复记录。
- [早期 MVP 验收](acceptance.md)、[全局输出](global-jianpu-output-acceptance.md)、[来源页脚](export-footer-source-acceptance.md)、[两行页脚](footer-two-row-acceptance.md)：历史证据；最新页脚顺序以当前发布记录为准。

真实曲谱、截图、导出件、地址和运行日志保存在被忽略的 `local/`；公开文档只记录可复用的结论。

## 历史与来源

- [历史 MVP 计划](history/mvp-plan.md)、[早期用户故事](user-stories.md)、[来源调研](sources.md)。
- [本地旧 issue 索引](issues/README.md)、[八度点 spike](spikes/001-omr-octave.md)、[结构化导入 spike](spikes/002-structured-score-import.md)、[已批准接入记录](integration-2026-10-16.md)。
- [Dolce 来源与固定版本](../app/UPSTREAM.md)；`app/docs/` 保留上游实现资料，不代表 Nota 当前界面说明。

Agent 协作入口在 [AGENTS.md](../AGENTS.md)，tracker、标签与领域文档规则位于 [agents/](agents/issue-tracker.md)。
