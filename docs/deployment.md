# 自行部署与反代

Nota 以单实例运行，访问同一实例的人共享曲谱库；应用不提供登录、成员角色或多空间。项目代码采用根目录 [MIT 许可证](../LICENSE)，Dolce 和第三方资源的原有许可保留。曲谱采用服务端文件持久化，不提供 GitHub Pages 静态版。

公开文档中的 `nota.example.com` 是示例域名，使用时替换为自己的入口。实际域名、云厂商、主机名、网络地址、个人目录与运行记录仅保存在被 Git 忽略的 `local/`，不要写进仓库、提交说明或 GitHub Issues。

## 运行完整服务

在项目根目录执行：

```sh
npm run setup
npm test
npm run build
npm run preview
```

`preview` 默认仅监听本机 `127.0.0.1:5173`，同时提供构建页面、共享曲谱库与结构化来源 API。需要让同一网络的其他设备访问时，可自行选择监听地址；不要把仅有静态文件的托管当成完整服务。

Vite preview 直接读取 `app/out/dist/`。在同一 checkout 重新构建会覆盖正在使用的静态产物，即使不重启服务也会改变页面。开发验证应使用独立 checkout 或单独的构建输出目录。

## HTTPS 反代

- 将页面、静态资源、`/api/library` 和 `/api/score-sources` 代理到同一个实例，保留路径。建议使用域名的根路径；当前 API 使用 `/api/` 绝对路径。
- 反代保留浏览器请求的 `Host`（非默认端口也需保留），透传 `Origin`。写入接口会比较两者，不应通过删除 Origin 绕过校验；应用不依赖 `X-Forwarded-Host` 判断来源。
- 将实际入口主机名加入 `NOTA_ALLOWED_HOSTS`，不带协议、路径或端口。多个主机名用逗号分隔。例如：

```sh
NOTA_ALLOWED_HOSTS=nota.example.com npm run preview
```

- TLS 在反代入口终止。上游地址由部署者按实际网络设置，需确保反代能连接 Nota 服务；同机反代可以使用本机监听地址。
- 反代请求体限制需容纳带原图的保存请求；曲谱库 JSON 请求上限为 48 MiB。

能访问实例的人共用其读写入口；如需限制访问范围，由部署者在网络或反代入口控制。上线前需在自己的环境验收 HTTPS 页面、API、保存与冲突保护、联网找谱、原图上传及导出；项目的测试结论不代表任意部署均已通过验证。

## 可选的统一登录网关

可在 HTTPS 入口接入 Authelia 等独立网关，由反代在访问页面和 API 前校验会话。Nota 本身仍不增加账号、成员或曲谱权限；通过网关的人访问同一个实例共享库。

- 网关负责登录页、会话 Cookie、退出和“记住登录”的有效期。浏览器关闭后是否保持登录由网关策略与客户端存储共同决定，不能仅靠 Nota 设置保证。
- iPhone 主屏幕 App 宜保留同源登录路径，例如 `https://nota.example.com/auth/`，并让登录成功后返回原页面；登录页不能再次要求已登录而形成重定向循环。
- 页面未登录时跳转登录页；`/api/` 未登录时返回明确的 401，避免把登录 HTML 当成曲谱库数据。登录门户及安装所需 Manifest/图标的可达性需单独验证。
- 应用不信任客户端自报的身份头。网关凭据及会话不需要传给 Nota；代理是否剥离 Cookie 或 Authorization 应按被保护应用的契约配置。
- 账号、域名、密钥、Cookie 和网关备份属于部署者的私有运维资料，保存在 `local/` 或独立私有运维项目，不进入仓库。

部署后分别验收正常浏览、未登录 API、登录后曲库读写、退出、关闭再打开和会话过期。认证发生在 TLS 连接之后；改用登录网关不能解决 VPN 路由或 TLS 握手故障。

## macOS 常驻服务

仓库提供可选的用户 LaunchAgent 安装脚本：

```sh
npm run deploy:mac
# 使用自定义域名时：
NOTA_ALLOWED_HOSTS=nota.example.com npm run deploy:mac
```

脚本重新构建应用，安装或更新 `~/Library/LaunchAgents/ink.nota.web.plist`，运行 Vite preview，监听 `0.0.0.0:5173`。用户登录后自动启动，进程退出后由 LaunchAgent 拉起；关闭终端不会停止服务。

传入的 `NOTA_ALLOWED_HOSTS` 会与自动取得的本机 `.local` 名称一起写入 LaunchAgent。下次部署仍需传入自己的域名配置；不要把真实域名硬编码到脚本。

查看或重启服务：

```sh
launchctl print "gui/$(id -u)/ink.nota.web"
launchctl kickstart -k "gui/$(id -u)/ink.nota.web"
```

开发服务应选择其他端口或独立 checkout，避免与在用服务冲突。

## 持久化与备份

曲谱默认位于项目的 `local/library/`，每份为独立 JSON 文件，包含可编辑原稿、名称、调号、保存时间与版式；识谱作品还保存原图和校对数据。备份整个目录即可保存曲谱库，重新构建或重启服务不会清理它。

Mac 部署脚本将日志写入 `local/runtime/nota.log` 与 `local/runtime/nota-error.log`。这些目录被 Git 忽略。开发验证可以设置 `NOTA_LIBRARY_DIRECTORY=/path/to/test-library`，使用隔离库，避免改动正式曲谱。

## Safari Web App 与 iPhone 主屏幕 App

使用自己的 HTTPS 实例地址：

- iPhone：Safari 打开页面，选择“共享 → 添加到主屏幕”，从 Nota 图标启动并打开一首曲谱。
- macOS：Safari 选择“添加到程序坞”，从独立 Web App 启动。

两者访问同一实例的曲谱库，需要服务主机在线；不提供离线曲谱库。Manifest 使用 standalone，应用图标已接入。iPhone 主屏幕独立启动与打开曲谱已有用户确认，见[当前验收](acceptance/current-release.md)；自己的部署仍需检查登录跳转、重新打开、安全区、文件接收与音频等行为，不能只凭图标出现判定所有功能通过。

## 结构化来源导入

已支持“联网找谱”与 agent 候选文件；能力与验证边界见 [接入记录](integration-2026-10-16.md)。

```sh
npm run score:setup
npm run score:search -- "摇篮曲"
npm run score:prepare -- --id usa --out local/usa.nota-score.json
```

服务主机需要 Node.js，以及用于独立 ABC 验证的 uv、Python/music21（固定 music21 10.5.0）。`score:setup` 准备验证环境；运行时使用缓存，不在请求中安装依赖。可以用 `NOTA_UV` 指定 uv 可执行文件。

候选支持 `--url HTTPS文件链接 --title 曲名 --license 逐曲许可说明 --format abc|musicxml --part 0`（MusicXML 声部序号从 0 起）；多声部 ABC 还需 `--voice 1`。目前只接受已允许的 MIT、Gutenberg、OpenScore/GitHub、Mutopia HTTPS 来源，LilyPond 本身未接转换。原图识谱不使用这些来源服务。

服务重新取得来源文件、核对哈希和候选谱文后才允许打开；保存到曲谱库仍需用户明确操作。原始下载保存在 `local/source-imports/`，可连同曲谱库备份。

## agent 的独立机器入口

曲谱库 CLI 使用 `/api/agent/library` 及其子路径，Nota 对每次请求校验 Bearer 工具凭据。部署者通过 `NOTA_TOOL_CREDENTIALS_FILE` 指定私有哈希凭据文件；发放、撤销和 CLI 安装见 [客户端说明](../cli/README.md)。该变量不可指向 Web 静态资源目录；常驻 macOS 服务可在执行 `npm run deploy:mac` 时传入绝对路径，脚本会写入本机 LaunchAgent。

有网页登录网关时，必须将这一路径单独匹配，保留 `Authorization` 并转发到同一个 Nota 服务，由 Nota 验证工具凭据。只免除这条机器路径的浏览器会话要求，不把整个 `/api/` 放行；既有页面、`/api/library`、`/api/score-sources` 及其他入口继续沿用原保护。不要信任调用者自报身份头，不要使用仅检查 Host/Origin 的规则代替凭据。机器凭据只授权曲谱库入口，不授予页面登录。

以下是 Caddy 的路径示例，须放在现有登录保护规则之前；其余网页登录规则保留原配置：

```caddyfile
@nota_agent path /api/agent/library /api/agent/library/*
handle @nota_agent {
    reverse_proxy 127.0.0.1:5173
}
# 既有网页登录保护与其他代理规则继续放在后续 handle 中。
```

若原代理统一剥离 `Authorization`，这条机器转发必须取消该剥离；不要给请求注入任何有效工具凭据。保持原 Host，HTTPS 在入口终止，服务主机上游不得通过另一个未经保护的公网地址暴露网页曲谱库。凭据文件每次请求重新加载，撤销无需重启；无配置、错误凭据、撤销或无法读取配置时均返回 JSON 401。

在实际 HTTPS 入口至少检查：有效凭据能列出并读取；没有、错误及已撤销凭据均返回 401；撤销甲不影响乙；工具凭据不能替代网页会话；未登录网页仍受保护。CLI 不跟随重定向，也不会把成功 HTML 登录页当作曲谱数据。仓库内隔离 HTTP 测试只能证明应用行为，实际网关适配的通过结果应另存在部署者的私有证据中。
