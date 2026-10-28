# 让 agent 维护曲谱库

部署者先接入新增服务与机器接口；之后熟人安装 skill 和 CLI，配置一次个人凭据，即可从源码仓库以外的目录连接同一实例。日常加曲、改曲无需重新构建或重启应用。首版使用 Node.js 24、npm 10，CLI 版本 `0.1.0`，不要求公开 npm 发布，也不增加 MCP 或 Nota 账号体系。

## 维护者制作交付件

```sh
npm run release:agent-tools
```

产生 `local/releases/nota-agent-tools-0.1.0.tar.gz`，包含 CLI npm 包、`skill/nota-library`、本说明、CLI 说明与 MIT 许可证。交付件不包含实例配置、凭据或真实曲谱。维护者私下分发该压缩包及单独的个人凭据。

## 使用者安装

解包到一个长期保留的位置，不需要源码 checkout：

```sh
tar -xzf nota-agent-tools-0.1.0.tar.gz
cd nota-agent-tools-0.1.0
npm install -g ./cli/nota-cli-0.1.0.tgz
nota-library --version
```

skill 通过 SkillFlow 安装到 Codex。先查看当前状态，再预览本次 skill 文件夹（把示例路径换成刚解包的绝对路径）：

```sh
skill-flow bridge --json --request '{"protocolVersion":"1.0","command":"list"}'
skill-flow bridge --json --request '{"protocolVersion":"1.0","command":"preview-import-source","payload":{"locator":"/absolute/path/nota-agent-tools-0.1.0/skill/nota-library"}}'
```

确认预览仅为 `nota-library`，再通过 SkillFlow 正式导入并启用到 Codex：

```sh
skill-flow bridge --json --request '{"protocolVersion":"1.0","command":"import-source","payload":{"locator":"/absolute/path/nota-agent-tools-0.1.0/skill/nota-library","draft":{"skillSelectionMode":"all","selectedSkills":[],"enabledTargets":["codex"]}}}'
skill-flow bridge --json --request '{"protocolVersion":"1.0","command":"doctor"}'
```

若返回错误，按具体错误处理。不要手工复制到 Codex skill 目录或修改 SkillFlow 状态；已有同名来源时先 inspect，按返回的 source/leaf IDs 定向更新或 apply，保留其他来源和目标设置。安装后新开 Codex 会话，让它使用 `$nota-library`；也可用自然语言要求维护 Nota 曲谱库。

从部署者取得实例地址和个人工具凭据，将凭据保存在私有文件后配置：

```sh
nota-library config --url https://nota.example.com --token-stdin < /path/to/private-token
nota-library list
```

凭据与实例保存在用户自己的配置，不写入 skill。凭据发放/撤销、命令、提案格式及错误状态见 [CLI 说明](../cli/README.md)。网关适配见 [部署说明](deployment.md)。网页仍按原部署的登录保护访问，机器 CLI 使用独立 Bearer 凭据。

## 日常协作

明确的新建或修改要求经服务端检查和实际改动核对后，agent 直接保存并回读，返回摘要与曲谱链接。同名候选、未说明的音高/节奏或其他影响正确性的歧义需要人选择；版本冲突保留提案，不静默覆盖。来源记录、解析检查、原稿对照与人的试听分别报告。

人最后在曲谱库听、看并提出修正，试听不作为保存硬 gate。软删可以从「已删除曲谱」恢复删除时的完整记录；修改没有历史版本，误改需再次修正。

原图远程改谱当前支持完整映射的 `123/jianpu` 项目，使用精确局部范围同步；其他不安全项目拒存并保留原件。此功能不增加自动识谱准确性保证。

## 升级

安装维护者提供的新版本 CLI 包，既有实例和凭据配置沿用。新 skill 替换首次导入的外部交付文件夹内容，并保持该外部源的绝对路径不变（不是修改 SkillFlow 管理的 source 或 Codex 目标目录）。先通过 SkillFlow inspect 确认 sourceId，再用 `update` 的 `sourceIds` 仅更新该来源；如需调整目标，用 inspect 返回的完整 leaf IDs 和目标列表 apply。升级后 doctor，并以新 Codex 会话核对发现情况。首次新增服务能力需要部署，之后曲谱内容维护与应用发布独立。
