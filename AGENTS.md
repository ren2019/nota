# Nota 项目协作规则

开始开发或变更范围前，读取 [docs/brief.md](docs/brief.md)；当前执行顺序见 [docs/plan.md](docs/plan.md)。核实上游能力时，读取 [docs/sources.md](docs/sources.md)，并检查所引用版本的源码。

- 用户沟通与项目说明使用中文；代码命名遵循选定底座。
- 以原对话后段的需求修正为准：曲谱优先、歌词可选，两种转换都需要，数据表示保持简单。
- 沿用候选底座的一种有效简谱表示；半音计算可以临时进行，不为两种转换另设平行的绝对音高存储模型。
- 开发转换功能时，分别验证实际移调后的音程关系，以及重新记谱前后的逐音音高和音区不变。节奏、休止符、连线、小节及反复结构也需保留。
- 将“文档宣称”“源码已核对”“样谱实测通过”分开记录；仅在实测后报告端到端能力可用。
- 真实曲谱和导出件存入 `local/`；`.upstream/` 只作为本地源码参考。引用或移植上游代码时保留相应许可与来源。
- 用户已选择在 Dolce 界面上开发 MVP。应用在 `app/`；新增练习谱功能集中在 `app/src/nota/`，复用 Dolce 的编辑、识谱、试听与排版能力。
- 转换逻辑修改后运行 `npm test`；交付前运行 `npm run build`。界面或导出改动需在浏览器实际操作并目视核对成品。每次交付说明可运行部分、验证结果及尚未接通的步骤。

## Agent skills

### Issue tracker

规格、任务及状态以 `ren2019/nota` 的 GitHub Issues 为准；创建、读取或更新 issue 前读取 [tracker 约定](docs/agents/issue-tracker.md)。

### Triage labels

使用五个默认分诊标签；标记或筛选 issue 前读取 [标签映射](docs/agents/triage-labels.md)。

### Domain docs

采用 single-context；探索代码、讨论术语或架构决定前读取 [领域文档规则](docs/agents/domain.md)。
