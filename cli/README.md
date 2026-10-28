# Nota 曲谱库 CLI

通过运行中的 Nota 实例操作共享曲谱库，不依赖源码 checkout。首版使用 Node.js 24；无需公开 npm 发布。

## 私下安装

维护者在源码仓库执行 `npm pack ./cli --pack-destination local/`，私下交付产生的 `nota-cli-0.1.0.tgz`。使用者只需取得交付件，在任意工作目录执行：

```sh
npm install -g /path/to/nota-cli-0.1.0.tgz
nota-library --version
nota-library --help
```

升级时安装维护者发来的新版本交付件；实例、凭据配置沿用。客户端代码采用 MIT，附带许可证。

## 首次配置

从部署者取得实例 HTTPS 地址和个人工具凭据。将凭据保存在本机私有文件，不要写进 skill、会话消息、命令参数或仓库：

```sh
nota-library config --url https://nota.example.com --token-stdin < /path/to/private-token
nota-library list
nota-library find '曲名'
nota-library get 12345678-1234-1234-1234-123456789abc
```

默认配置为 `~/.config/nota-library/config.json`，权限为 `0600`；`NOTA_CONFIG` 可指定其他私有配置文件。`NOTA_URL`、`NOTA_TOKEN` 可由 agent 的私有环境注入，覆盖保存配置。凭据不在输出中显示。远程实例要求 HTTPS；仅环回地址支持 HTTP 测试。实例地址须使用根路径。

`find` 返回所有匹配候选及各自唯一编号、修订版本、更新时间、来源等摘要，不自动挑选同名曲谱。`get` 返回完整记录，包括谱文、来源、排版及原图项目。机器入口是 `/api/agent/library`；不能用浏览器 Cookie 代替工具凭据。

## 检查并新建

准备一份 UTF-8 JSON 提案，必填 `title`（曲谱库名称）、`format`（谱文格式）和 `text`（完整谱文）；可带 `key`、`meter`、`source`、`presentation` 和真实 `project`。提案与曲谱、凭据一样保存在私有位置。歌词可选，已有歌词不应为通过检查擅自删除。

```sh
nota-library check --file /path/to/proposal.json
nota-library create --file /path/to/proposal.json
```

`check` 请求运行服务检查，不写库。首版服务端复用底座的 123、ABC、JCX、PU、jianpu-ly、JPWABC 和 MusicXML 原生解析器及小节时值规则；无法可靠解析、未解决的解析诊断、没有可用旋律或拍数错误会阻止写入。报告给出源码位置、小节及实际/预期拍数。原图项目须可恢复且与谱文、格式一致。合法弱起、连音与变拍遵循底座规则，不自动补音、删音或改变拍号。

`create` 先取得服务端检查报告；最终 POST 的实际内容仍会重新检查，不能用旧报告跳过检查。曲名相同时返回 `ambiguous` 和候选编号。agent 应先询问是修改已有曲谱，还是有意另建版本；只有后一种得到明确意图后才使用：

```sh
nota-library create --file /path/to/proposal.json --allow-duplicate-title
```

成功状态为 `created`，`data` 包含回读核对过的完整 `record`、可打开的 `url`、本次 `check` 范围和 `summary`。这表示已保存并回读，不能声称已经逐音对照原稿或由人试听。人随后在曲谱库查看、试听；试听不阻塞保存，也不创建待审状态。

CLI 为每次新建生成请求编号；创建响应丢失时，只尝试查找该编号并回读，不自动重复 POST。仍无法确认或回读版本/内容不符时退出 8，返回 `result_unconfirmed`、请求编号及可用的曲谱编号，保留原提案文件。先按编号查找核实，不能因连接失败就盲目重复新建。

## 结果契约

每次命令输出一行 JSON；不会等待人工交互。

- 成功：`{"ok":true,"status":"listed","data":[]}`。`find` 的状态为 `candidates`，`get` 为 `read`，配置为 `configured`。
- 失败：`{"ok":false,"code":"unauthorized","message":"…"}`。
- 退出状态：0 成功；2 参数或配置错误；3 权限问题；4 连接失败；5 不存在；6 并发冲突；7 检查失败；8 保存结果未确认；9 歧义需要确认；10 服务或协议错误。读命令目前使用其中相应状态，其余供后续写命令沿用。
- HTTP 重定向不会携带凭据自动跟随。HTML 登录页不当作成功曲谱数据；请检查实例的机器入口。

## 部署者：独立发放和撤销

在服务主机的私有路径创建 `0600` JSON 文件，并以 `NOTA_TOOL_CREDENTIALS_FILE` 指向它。文件保存个人凭据的 SHA-256 哈希，不保存明文；格式为 `{"credentials":[{"name":"friend-a","sha256":"<64位小写十六进制哈希>"}]}`。`name` 仅方便部署者管理，不是账号或角色。

使用仓库的管理脚本生成一份个人凭据。明文只写入指定的私有交付文件，不打印到终端；将该文件单独安全地交给对应使用者：

```sh
node scripts/tool-credentials.mjs issue --file local/private/tool-credentials.json --name friend-a --out local/private/friend-a.token
NOTA_TOOL_CREDENTIALS_FILE=/absolute/path/to/private/tool-credentials.json npm run preview
```

另一个人用另一个名称发放。撤销时执行：

```sh
node scripts/tool-credentials.mjs revoke --file local/private/tool-credentials.json --name friend-a
```

每次机器请求重新读取凭据文件，撤销立即生效，无需重启服务，也不影响其他人。凭据文件缺失、损坏、没有匹配项时拒绝访问。不要把文件放进静态资源目录。首次将环境变量传入运行服务需要重启；之后发放/撤销只修改私有凭据文件。常驻 macOS 服务部署时也传入该变量，脚本会记录到用户自己的 LaunchAgent。

反代和登录网关的独立机器路径配置见 [部署说明](https://github.com/ren2019/nota/blob/main/docs/deployment.md)。在实际入口验证凭据及撤销，并确认原网页访问仍要求登录；仅安装 CLI 不表示网关已接通。

## 可重跑验证

仓库维护者执行 `node --test cli/test/*.test.mjs`。测试会打包并在源码之外的临时目录真实安装 CLI，连接真实 HTTP 服务及隔离持久化，检查授权读取、同名候选、完整数据回读、凭据撤销、网页保护、服务端最终检查、合法音乐结构与创建响应丢失。测试数据是明确的合成 fixture，不代表《Five Little Ducks》真实曲谱验收；真实曲谱和部署证据另存于私有 `local/`。
