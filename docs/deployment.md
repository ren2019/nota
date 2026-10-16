# Mac mini 部署

服务运行在当前 Mac mini（`nota-host`），监听 `0.0.0.0:5173`，提供正式构建与家庭曲谱库 API。

## 访问

- 局域网：[192.0.2.10:5173](http://192.0.2.10:5173/?lang=zh)
- 本地域名：[nota-host.local:5173](http://nota-host.local:5173/?lang=zh)
- 本机：[127.0.0.1:5173](http://127.0.0.1:5173/?lang=zh)

手机、平板与电脑连接同一局域网后，打开同一地址即可共享曲谱。IP 地址是部署验收时的地址；网络地址变化时可用本地域名或查看 Mac mini 的新地址。

## 持久化与备份

曲谱存放在项目的 `local/library/`，每份为独立 JSON 文件，包含可编辑原稿、曲名、调号、保存时间与版式。识谱作品还保存打包后的原图和校对数据。

备份整个 `local/library/` 即可保存曲谱库。这个目录被 Git 忽略，重新构建或重启服务不会清理它。

服务日志在 `local/runtime/nota.log` 与 `local/runtime/nota-error.log`。

## 部署与更新

在项目根目录执行：

```sh
npm run setup       # 首次安装或依赖发生变化时
npm test
npm run deploy:mac  # 构建、安装/更新用户服务，并检查首页与曲谱库已就绪
```

`deploy:mac` 使用当前 Node 的绝对路径启动 Vite preview 与曲谱库，关闭终端不影响运行。它安装的是用户 LaunchAgent：Mac mini 用户登录后自动启动，进程异常退出会自动拉起。它不依赖打开 ChatGPT 或编辑器。

用户服务文件：`~/Library/LaunchAgents/ink.nota.web.plist`。

查看或重启服务：

```sh
launchctl print "gui/$(id -u)/ink.nota.web"
launchctl kickstart -k "gui/$(id -u)/ink.nota.web"
```

当前部署以家庭局域网共用为范围，没有账号与公网入口。`npm run dev` 仍可用于本地开发；使用前先停用同端口的正式服务，或为开发服务器选择其他端口。

## Safari App

Safari 打开 `http://192.0.2.10:5173/?lang=zh`，选择「共享 → 添加到程序坞」。已在 Mac mini 实际创建 `~/Applications/Nota.app`，独立窗口能打开共享库、上传图片、编辑并下载打印版。Manifest、180/192/512 像素 Nota 图标和 Apple Web App 元信息已接入。

这套局域网部署需要主机在线，不提供离线曲谱库。其他实体 iPhone/iPad 尚未代替用户实机验收。

## 结构化来源导入

已支持「联网找谱」与 agent 候选文件；说明及验证范围见 [本轮接入记录](integration-2026-10-16.md)。

```sh
npm run score:setup                          # 首次准备固定的独立 ABC 验证环境
npm run score:search -- "摇篮曲"             # 查询首批来源及 OpenScore
npm run score:prepare -- --id usa --out local/usa.nota-score.json
```

agent 也可以用 `--url HTTPS文件链接 --title 曲名 --license 逐曲许可说明 --format abc|musicxml --part 0`（MusicXML 声部序号从 0 起）；多声部 ABC 还需 `--voice 1`。目前只接受 MIT、Gutenberg、OpenScore/GitHub、Mutopia 的 HTTPS 文件，LilyPond 本身未接转换。原图识谱不使用这些外部服务。

ABC 验证使用已缓存的 music21 10.5.0，请求中不联网安装依赖。主机需要 uv；支持 `/opt/homebrew/bin/uv`、用户 `.local/bin/uv` 等路径，也可设置 `NOTA_UV`。本机环境已通过正式 LaunchAgent 请求验证。

导入候选在首页「联网找谱」对话框选择；服务会重新取得源文件、核对哈希和候选谱文，再允许打开。保存来源数据时仍需用户点击工作台的「保存到曲谱库」。原始下载保存在 `local/source-imports/`，可连同曲谱库备份。

开发验证可设 `NOTA_LIBRARY_DIRECTORY=/绝对路径` 指向隔离曲库；正式服务未设置此变量，仍使用 `local/library/`。
