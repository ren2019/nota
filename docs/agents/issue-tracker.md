# Issue tracker: GitHub

规格和开发任务以 [ren2019/nota 的 GitHub Issues](https://github.com/ren2019/nota/issues) 为准，使用 `gh` CLI 操作。Git remote 指向该仓库；在仓库外执行时显式使用 `--repo ren2019/nota`。

## 操作约定

- 创建 issue：`gh issue create --title "标题" --body-file <正文文件>`，按技能要求添加标签。
- 读取 issue：`gh issue view <编号> --json number,title,body,labels,comments`。
- 列出开放任务：`gh issue list --state open --json number,title,body,labels,comments`，按需添加标签筛选。
- 评论：`gh issue comment <编号> --body-file <正文文件>`。
- 修改正文：`gh issue edit <编号> --body-file <正文文件>`。
- 添加或移除标签：`gh issue edit <编号> --add-label "标签"` 或 `--remove-label "标签"`。
- 完成后关闭：`gh issue close <编号>`；关闭前记录结果、验证证据与尚未覆盖的范围。
- 发布规格时创建 GitHub issue；读取相关 ticket 时读取对应 issue 及其评论。
- 多行正文写入临时文件并使用 `--body-file`，保留真实换行。不要把整段正文拼入 shell 参数。

## 任务关系

- 用 GitHub 原生 sub-issues 表示父子任务；无法使用时，子任务正文写 `Part of #<父编号>`，父任务维护子任务清单。
- 用 GitHub 原生 issue dependencies 表示阻塞；不可用时，正文写 `Blocked by: #<编号>`，并核对阻塞任务是否仍开放。
- 使用 `/wayfinder` 时，地图 issue 用 `wayfinder:map`，子任务用 `wayfinder:research`、`wayfinder:prototype`、`wayfinder:grilling` 或 `wayfinder:task`；需要使用时再创建相应标签。

## Pull requests as a triage surface

**PRs as a request surface: no.**

## 本地历史记录

原有本地 issue 和 spike 文档保留历史证据。新规格、任务和后续状态在 GitHub 更新；本地副本附远程链接，避免形成两个独立 tracker。真实曲谱、原图、导出件与本地运行证据继续保留在忽略目录中，不随 issue 或仓库上传。
