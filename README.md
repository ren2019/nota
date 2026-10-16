# Nota

A simple way to make sheet music.

把已有曲谱转换成方便练习与打印的简谱：导入、校对、转换，再生成清晰的打印版。以单旋律谱为主，歌词可选。

项目上下文来自[「开源简谱转换方案」对话](https://example.invalid/removed-private-discussion)。以对话末段及后续的需求修正为准，产品名称为 Nota。

## 自行部署与共享曲谱库

Nota 采用自行部署的单实例模式，不需要账号或多空间。部署者可以在自己的主机运行完整服务，并按需配置 HTTPS 反代；配置要求见 [部署说明](docs/deployment.md)。

曲谱保存在当前实例，访问同一实例的人共享首页的曲谱库。编辑态右上角「保存入库」保存可编辑原稿；首页可搜索、重新打开，编辑后可更新原记录或另存一份。也可从「新建空白谱」开始。

曲谱实际保存在 `local/library/`，含原图的识谱项目一并保存，关闭浏览器或重启服务后仍保留。该目录不纳入 Git；备份它即可备份共享曲谱。PNG/PDF 下载仍是独立导出功能。

Safari 打开自己的实例地址后，可在「共享 → 添加到程序坞」保存成 Web App。共享曲谱来自同一主机，App 无需另建账户。此处交付联网使用的 Safari Web App，不承诺离线访问曲谱库。

初始曲谱的版本与谱源说明见 [docs/library-seed.md](docs/library-seed.md)。原有示例保留。使用自己的种子文件执行 `npm run seed:library -- local/seeds/library-seed.json` 会跳过同名作品，不覆盖其他人的编辑。

独立「联网查谱」页面可检索结构化来源并独立核对音高、八度、时值和结构，打开候选后再自行保存；也可导入 agent 准备的候选文件。原生 ABC/MusicXML 保留来源与导入时的验证信息。图片识谱增加局部高音点恢复和复核提示，整张真实照片仍需校对。接入范围、iOS 播放修复及实测边界见 [本轮记录](docs/integration-2026-10-16.md)。

## 本地开发

基于 Dolce 的真实界面、编辑器和排版引擎，已经加入练习谱转换面板。

```sh
npm run setup
npm run dev
```

打开 <http://127.0.0.1:5173/?lang=zh>，点击「查看示例乐谱」。内置 `1=E♭` 的《小星星》：可分别试用实际移调和保持音高的重新记谱，再下载 PNG 或 A4 PDF。

也可用 Dolce 原有入口导入图片/PDF 或数字乐谱，校对后再转换。原始编辑、试听、五线谱视图与保存入口均保留。

新增能力：两种转换、12 种目标基准、转换结果说明、还原最近一次转换、三档数字大小、A4 黑白练习版、纯简谱 PNG/PDF 导出。多页 PNG 打包为 ZIP；PDF 和 PNG 为 300 dpi 栅格输出。

当前转换范围为单首、单声部、单旋律；遇到多音和弦或交叠声部会提示。实际移调暂不改写和弦名称，出现时会提示人工核对。两张 AirDrop 原图已实测，自动识别仍有错误，必须校对；详情见验收记录。

PDF、PNG 与 PPTX 共用导出页脚配置，练习面板和「导出」对话框均可打开「导出页脚」。署名、日期、页码默认开启，日期取导出设备本地时区，多页才显示页码。页脚仅加在导出副本上，普通 A4 正文及分页不变；长图必要时增加底部空间，极小底边距的满页会整体等比收小以避让页脚，不生成空白页。当前没有独立 SVG 下载入口；MIDI、MusicXML 和文本谱保持原始音乐数据。

## 开发

代码仓库位于 [ren2019/nota](https://github.com/ren2019/nota)，规格与开发任务使用 [GitHub Issues](https://github.com/ren2019/nota/issues)。Agent 协作入口在根目录 AGENTS.md，技能配置在 `docs/agents/`。

```sh
npm test       # 音高、八度、节奏与结构的转换回归
npm run build # TypeScript 检查 + Vite 生产构建
```

`app/` 是纳入版本控制的 Dolce 基础应用，保留上游许可和文档。新增转换与面板位于 `app/src/nota/`；导出接在原有 `app/src/editor/export.ts`。上游版本见 [app/UPSTREAM.md](app/UPSTREAM.md)。

## 两种核心转换

| 操作 | 实际音高 | 简谱表示 |
| --- | --- | --- |
| 实际移调 | 随目标调改变 | 保留音级、升降记号及节奏关系 |
| 重新记谱 | 保持每个音的音高与音区 | 按新基准重算数字、升降号和八度点 |

`1=C` 是记谱基准，不能据此断言曲子变成 C 大调或只用白键。

## 开源许可

Nota 采用 [MIT 许可证](LICENSE)。基于 Dolce 的代码保留其版权、[MIT 许可及第三方资源许可](app/LICENSE)，来源见 [app/UPSTREAM.md](app/UPSTREAM.md)。真实曲谱与导出件不属于项目代码许可的授权范围。

## 从这里继续

- [当前 IA 与用户旅程规格](https://github.com/ren2019/nota/issues/9)：实施范围与后续任务以 GitHub Issues 为准。

- [需求与边界](docs/brief.md)：已确认需求、简化原则和第一阶段验收。
- [实施路线](docs/plan.md)：MVP 已完成项、验证结果与后续工作。
- [来源与验证记录](docs/sources.md)：原对话、候选源码版本和证据边界。
- [项目协作规则](AGENTS.md)：后续开发的上下文入口。

真实曲谱、手工校对稿和导出文件放入被忽略的 `local/`。可公开且允许分发的测试材料，后续随选定底座建立正式 fixtures。

## 部署与验收

`npm run deploy:mac` 重新构建并部署到当前 Mac 的用户 LaunchAgent，监听局域网 5173 端口。登录后自动启动，退出终端不影响运行。

运行维护见 [docs/deployment.md](docs/deployment.md)，用户故事及验收证据见 [docs/acceptance.md](docs/acceptance.md)。个人实例的地址、域名、云厂商、网络拓扑和运行记录只保存在被忽略的 `local/`，不提交到仓库或 GitHub Issues。
