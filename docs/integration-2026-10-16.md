# 两项 spike 接入与 iOS PWA 播放修复

用户已明确批准两个 spike 合入。本次将验证过的最小能力接入工作台并部署到原 Mac mini 服务；不覆盖或新增正式库中的曲谱，原 11 份文件哈希保持不变。

## iPhone / iPad 播放

症状：用户确认是 iPhone/iPad PWA，进度移动但无声。已确认代码没有配置媒体音频会话；[WebKit 官方问题说明](https://bugs.webkit.org/show_bug.cgi?id=237322#c6)指出默认 ambient 会受 iOS 响铃静音模式影响，支持 AudioSession API 的版本可指定 playback。

实现：在播放手势中同步声明 `navigator.audioSession.type = "playback"`，再创建/恢复 AudioContext；上下文被系统中断时暂停播放时钟；恢复不成功或超时明确报错，不显示假播放。编辑时的按键试听也使用随应用分发的本地钢琴音色，失败后可以重试。

- 模拟 iOS 静音策略的回归，修改前出现“已排音符、时钟运行、会话仍 ambient”的失败；修改后通过。
- 回归覆盖暂停/继续、系统 interrupted、resume 后仍未 running、可选 API 不存在或抛错。
- Safari 真实 ScorePlayer 与本地 smplr 音色，经最终输出通道 AnalyserNode 观察，AudioSession=playback、最大 RMS=0.041312、无错误。没有使用麦克风；见 `local/qa/browser-audio-result.json`。
- 独立 Nota PWA 中实际打开《两只老虎》，播放进入“暂停”状态，进度前进；暂停保留位置，继续后接着前进，停止正常。

用户后续反馈「safari pwa 播放我实测正常了」，此前的手机 PWA 播放问题由用户实机确认恢复。桌面非零波形与用户实测分别记录；旧版本未提供 AudioSession API 时，本次不承诺绕过所有旧版系统的静音开关行为。

## NOTA-001 八度点

局部字号第二遍候选恢复已进入真实 `recognizeJianpu`。沿用现有点归属、文字/连线排除、叠点判断；没有全局将 0.45 阈值扩大为 0.60。原结果与局部结果八度不同，会附加 `oct.recovered`，保留点框、原八度、本行字号，并在现有黄色可疑处校对入口给出中文说明。

真实《星条旗》图中的 7 个高音 do 均为高音；目标漏点附带待复核标记。原清晰对照谱的数字、八度、时值、附点和增时线保持一致。几何负例验证偏离中心、过远、过小、过大的碎块不恢复，已经分类的点不重复计数。

Safari 实际上传 `IMG_4548.JPG`，切换「原位叠加」并点击「11 处可疑」，第一处定位第 3 小节第 1 拍 A♭5（唱名 `1'`），原图音符框呈黄色，显示「按本行字号恢复了八度点，原判定不同，请对照原图确认」。同时保留 7 小节拍数不对的提醒；未将测试结果写入正式库。

**整张真实图片仍有节奏、升号等错误，第二张图没有被宣布解决。** 本次交付是漏高音点修复与可复核证据，不是任意照片自动全对。

## NOTA-002 结构化找谱和候选

首页曲库标题旁增加「联网找谱」。支持首批《星条旗》《国际歌》《摇篮曲》来源，以及在线检索 OpenScore 固定版本的 MXL 索引（每次最多返回 20 个匹配项）。支持导入 agent 生成的 `.nota-score.json` 候选文件。

流程为：搜索/选择来源 → 实际下载 → 选取明确旋律声部 → 独立对照 → 显示曲名、版本、许可、来源、范围 → 打开候选编辑/校对 → 用户自行保存入库。准备和预览都不写曲库。独立验证参考只在比较时临时使用；持久化继续使用 Dolce 已支持的 ABC / MusicXML。

独立解析：ABC 用固定版本 music21 10.5.0；MusicXML 直接读取原 XML 的 pitch/alter/octave、duration/divisions、tie、slur、repeat/ending，再与原生 `loadScoreDoc` 模型对照。逐个起音保留，不再把相邻同音随意合并；只有相邻休止可等价合并。

接入时补出的关键限制：

- ABC→123 会把《星条旗》的部分延音写成同音连打；MusicXML→123 会损失《摇篮曲》的一条倚音连线。因此保留原生 ABC/MusicXML，不合入 spike 的窄 XML→ABC 适配器。
- 练习面板在把 ABC/MusicXML 转成 123 前增加音高、时值、起音和结构检查；发现损失则拒绝本次转换并保留原谱，不静默改变。现有移调算法不变。
- 原生《摇篮曲》的 implicit 弱起和结尾凑满一小节曾被编辑器严格拍数检查误报。修正仅限检查器：明确标为 implicit 的首小节仍允许其互补结尾；新增的、未声明弱起的不完整首小节仍报错。

三个在线来源实测：105/34、124/34、54/19（源音符数/小节数，含倚音），独立对照通过。原始《马赛曲》包含不支持的和弦/写法，拒绝导入；改了八度的候选也被拒绝。独立对照证明与数字源一致，不能证明原谱就是唯一正确标准版。

保存后记录源 URL、逐曲许可、原始 SHA-256、导入时间、声部和验证范围；后续编辑会标记 edited，不能把“导入时通过”当当前全文仍已验证。原始文件暂存在 `local/source-imports/`，不引入账户或数据库。

Safari 实际完成《摇篮曲》候选预览、原生五线谱打开、保存和重开；保存使用复制的隔离库 `local/qa/integration-library/`，正式库仍为 11 首。见 `local/qa/integrated-library-result.json`。

正式局域网地址的独立 Nota PWA 也实际检索“摇篮曲”，返回 10 个候选；选择勃拉姆斯版本后显示 54 音/19 小节对照通过，并打开原生五线谱。来源页显示 CC0 与原始链接；没有保存到正式曲库。

## 测试与部署

- `npm test`：原 408 组转换、页脚、排版、八度几何、音频会话、弱起检查与服务端测试通过。
- `npm run test:omr`：正式源码整条图片链的 7/7 高音 do、复核证据、清晰对照不退化通过。
- `npm run build`、`npm run deploy:mac`：TypeScript/Vite 构建通过，LaunchAgent 正式服务已更新。
- 正式服务三种地址首页、曲库、来源 API 均 200；在 LaunchAgent 环境实际运行三个来源和 ABC 独立验证，改八度的候选返回 422。
- 证据：`local/qa/deployed-integration-result.json`、`integration-tests.log`、`integration-deploy.log`、`integrated-omr-result.json`。

LilyPond 转换、多声部/和弦自动提取、开放式 LLM 搜索服务未加入。未知复杂结构会拒绝或需人工处理；没有以模型自评替代独立源数据。
