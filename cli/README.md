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

## 软删与恢复

先读取最新修订版本，再按唯一编号删除。`delete` 保留删除时的完整曲谱，从正常列表隐藏；`deleted` 在刷新或服务重启后仍能找到它。使用返回的新修订版本恢复，同名曲谱互不影响：

```sh
nota-library delete 12345678-1234-1234-1234-123456789abc --revision 3
nota-library deleted
nota-library restore 12345678-1234-1234-1234-123456789abc --revision 4
```

成功状态分别为 `deleted`、`restored`，两者都推进修订版本并回读核对完整内容。过期版本返回 `conflict`；已删除曲谱的普通读取和更新被拒绝。连接中断后只回读核实，不自动重复删除或恢复；无法确认则返回 `result_unconfirmed`。网页曲谱库的「已删除曲谱」提供相同的恢复入口。

修改不保留历史版本。恢复只找回删除时的版本，不能撤销删除前已经保存的误改；首版没有永久删除、清空或自动清理。

## 结果契约

每次命令输出一行 JSON；不会等待人工交互。

- 成功：`{"ok":true,"status":"listed","data":[]}`。`find` 的状态为 `candidates`，`get` 为 `read`，配置为 `configured`。
- 失败：`{"ok":false,"code":"unauthorized","message":"…"}`。
- 退出状态：0 成功；2 参数或配置错误；3 权限问题；4 连接失败；5 不存在；6 并发冲突；7 检查失败；8 保存结果未确认；9 歧义需要确认；10 服务或协议错误。删除和恢复也使用这些状态，不会在冲突后自动覆盖。
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

仓库维护者执行 `node --test cli/test/installed.test.mjs`。测试会打包并在源码之外的临时目录真实安装 CLI，连接真实 HTTP 服务及隔离持久化，检查授权读取、同名候选、完整数据回读、凭据撤销、软删与恢复及网页保护。测试数据是明确的合成 fixture，不代表《Five Little Ducks》真实曲谱验收；真实曲谱和部署证据另存于私有 `local/`。
