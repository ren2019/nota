# Nota

**轻松制作乐谱 · A simple way to make sheet music.**

将已有曲谱导入、校对，转换成方便练习和打印的简谱。基于 [Dolce](app/UPSTREAM.md) 的编辑、识谱、播放和排版能力，采用自行部署、同一实例共享曲谱库的模式。

## 使用流程

1. 从首页体验示例、新建空白谱，或通过图片/PDF、数字乐谱、联网查谱带入曲谱。
2. 从曲谱库打开默认进入「练习」，看谱、播放并调整阅读显示；「编辑」态提供调式、导出和专业编辑入口。
3. 深度改谱进入完整 Dolce 编辑页，保留原记号面板、源码/谱面编辑、原图校对、声部和原有响应式布局，返回时沿用同一稿件。
4. 「保存入库」保留可编辑稿，成功后回到练习；下载 PDF/PNG 或乐谱文件是独立操作，不代表已保存入库。

两态顶部的「…」提供重命名与从库中删除；库名可以不同于印刷标题。访问同一实例的使用者共用曲谱库，更新时保留修订冲突保护。

## 让 agent 维护曲谱库

提供独立的 `nota-library` CLI 和配套 skill，可从源码仓库之外连接运行实例，完成检查、新建、按版本修改、软删和恢复。skill 通过 SkillFlow 安装到 Codex；明确要求在检查通过后直接保存并回读，同名或音乐歧义才交给人判断。人可在曲谱库试听验收，试听不阻塞保存。安装、私下交付和升级见 [agent 工具说明](docs/agent-tools.md)。

## 两种转换

| 操作 | 实际音高 | 简谱表示 |
| --- | --- | --- |
| 实际移调 | 随目标调改变 | 保留音级、升降记号及节奏关系 |
| 重新记谱 | 保持每个音的音高与音区 | 按新基准重算数字、升降号和八度点 |

支持 12 种目标基准及最近一次转换的安全还原。`1=C` 表示记谱基准，不能据此断言曲子变成 C 大调或只用白键。转换目前限于单首、单声部、单旋律；多音和弦、交叠声部会提示，和弦名称暂不随实际移调改写。

## 导出与设置

PDF/打印和 PNG 使用紧凑导出入口，可选择纸张、方向、数字大小与歌词。多页 PNG 打包 ZIP；PDF/PNG 为 300 dpi 栅格输出。其余格式、可重导入文本和带原图的 `.dolce` 项目沿用编辑器支持条件；`.123` 文件不包含完整识别项目。

PDF、PNG、PPTX 共用导出页脚：来源占第一层，品牌靠左、日期与多页页码靠右放在下一层。署名、日期、页码三个开关默认开启，日期使用导出设备的本地时区；单页及连续长图不显示页码。MIDI、MusicXML 和文本谱不插入版式页脚，没有独立 SVG 下载入口。

全局输出偏好和页脚开关保存在当前浏览器的 `localStorage`，正常重新打开会沿用上次设置；不同设备、浏览器或独立 Web App 不保证共享，清除网站数据或存储不可用时可能恢复默认。曲谱本身的版面随曲谱入库，屏幕阅读设置与打印设置分别处理。

## 本地运行

使用 Node.js 24 LTS（验证版本 24.22.1）和 npm 10（验证版本 10.9.9）。可使用 `.nvmrc` 选择 Node；Node 26 暂不列入支持范围。如果 Node 自带的 npm 为 11，可先在任意目录执行 `npm install --global npm@10.9.9`，再用 `node --version` / `npm --version` 确认版本。在仓库根目录执行：

```sh
npm run setup
npm run dev
```

打开 <http://127.0.0.1:5173/?lang=zh>，点击顶部「体验」加载 `1=E♭` 的《小星星》，比较实际移调和保持音高重新记谱。

```sh
npm test        # 转换、播放、曲库、来源、当前稿及输入回归
npm run build  # TypeScript 检查 + Vite 生产构建
npm run preview
```

`preview` 默认监听本机 5173，同时提供页面与服务端 API。曲谱保存到服务主机的 `local/library/`，识谱项目连同原图保存；该目录不纳入 Git，需单独备份。初始曲谱与幂等种子导入见[曲谱来源](docs/library-seed.md)。

默认安装使用 `--ignore-scripts`，不执行依赖生命周期脚本；Web 构建、识谱和关键测试使用此安装方式验证。Node 侧原生 OMR 命令行工具是可选开发能力，确有需要时运行 `npm run setup:omr-native`，它仅重建 `onnxruntime-node`（可能联网下载原生运行库），与浏览器 Web 识谱分别验收。

## 自行部署与手机 Web App

运行完整服务并配置自己的 HTTPS 反代，步骤见[部署与备份](docs/deployment.md)。macOS 可选 `npm run deploy:mac` 安装用户 LaunchAgent。构建会覆盖当前 checkout 的 `app/out/dist/`；开发与验收应使用隔离 checkout，避免影响在用服务。

iPhone 使用 Safari「共享 → 添加到主屏幕」，macOS 使用 Safari「添加到程序坞」。应用访问同一实例，需要服务在线，不提供离线曲谱库。已取得 iPhone 主屏幕独立启动、打开曲谱及重新打开保持登录的用户确认，详见[当前发布与验收](docs/acceptance/current-release.md)；Android 与其他未逐项验证的行为另列。

Nota 本身不建设账号、成员角色或多空间。部署者可在入口使用独立登录网关限制访问，并由网关管理登录与记住登录；具体域名、凭据、网络拓扑和运维记录只保存在被忽略的 `local/`。

## 识谱与联网查谱的边界

图片/PDF 识谱结果需人工校对：局部八度点恢复与复核提示已接入，真实照片的整谱自动准确性尚未通过严格验收。人工校正稿不能当作自动识别成功。

独立联网查谱页检索已接入的受控结构化来源，支持常用中文作曲家别名，不是全网搜索。搜索命中不代表已验证可导入；准备候选后核对来源、许可、声部及音乐数据，用户采纳并保存才入库。外部 `.nota-score.json` 候选文件与命令行准备方法见[来源接入记录](docs/integration-2026-10-16.md)和[部署说明](docs/deployment.md)。

## 文档与开发

- [文档导航](docs/README.md)：当前说明、验收证据与历史记录。
- [当前发布与验收](docs/acceptance/current-release.md)：上线版本、用户确认和未验证范围。
- [后续计划](docs/plan.md)：剩余工作；规格和任务状态以 [GitHub Issues](https://github.com/ren2019/nota/issues) 为准。
- [需求与边界](docs/brief.md)、[领域术语](GLOSSARY.md)、[架构决定](docs/adr/0001-self-hosted-shared-instance.md)。
- [项目协作规则](AGENTS.md)与 [Dolce 来源](app/UPSTREAM.md)。

应用位于 `app/`，Nota 新增能力主要位于 `app/src/nota/`，服务端 API 位于 `app/server/`。`app/docs/` 与应用内 README 保留 Dolce 上游资料；Nota 当前行为以根 README 和本文档导航为准。

## 开源许可

本轮发行仅支持自行部署的 Web 应用；`app/src-tauri/` 保留上游参考代码，桌面包暂不发布，也未通过 Nota 原生构建验收。已知原生依赖问题见[发布范围](docs/release-scope.md)。

Nota 采用 [MIT 许可证](LICENSE)。Dolce 的版权、[MIT 许可及第三方资源许可](app/LICENSE)保留，来源见 [app/UPSTREAM.md](app/UPSTREAM.md)。真实曲谱、原图与导出件不属于项目代码许可的授权范围，统一放入被忽略的 `local/`。

第三方模型、字体和音源的来源、修改与许可见 [资源清单](app/THIRD_PARTY_ASSETS.md)。Web 源码发行使用 `npm run release:web`，仅收录允许的源码和公开资源；生成包位于被忽略的 `local/releases/`。
