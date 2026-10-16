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

## Safari Web App

Safari 打开自己实例的地址，选择“共享 → 添加到程序坞”保存为 Web App。它访问同一实例的曲谱库，需要服务主机在线；不提供离线曲谱库。Manifest 与应用图标已接入，具体设备行为需在部署环境验证。

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
