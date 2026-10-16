# NOTA-001：漏八度点的验证结果

2026-10-16；以下为审批前的 spike 验证记录。用户随后批准接入，已实施并部署的范围见 [接入记录](../integration-2026-10-16.md)；整张图片准确性仍未通过。

## 结论

用户报告属实。已找到并隔离复现一条确定原因：字号估计偏小，使真实高音点在连通域分类阶段被丢弃。两个候选均能把《星条旗》7 个高音 do 的正确数从 5 提高到 7；但整首谱仍有升号、附点、增时线错误，《莫斯科郊外的晚上》也未解决。不能将此 spike 作为“图片识谱全对”的验收。

建议下一步产品范围：保留点候选，按音符行字号和几何关系复判；标出候选分歧并定位回原图，人工核对后才明确确认。暂不直接上线全局放宽阈值，不引入新的大模型服务或训练流程。

## 可重跑的失败与最小复现

真实图片：`local/test-cases/IMG_4548.JPG`，SHA-256 `0d319ae11c950840e28bfdfb1241ac2617f075ae7d0ae9036d2add603b05e2e3`。目标为第 3 小节首音，数字框 `(348,276,9,17)`，原图明确印有上点。

在项目根目录执行：

```sh
node local/spikes/001-octave/repro.mjs
```

约 2 秒；实际运行结果为 `digit=1, octave=0`，断言报 `高音do被识别成普通do / 0 !== 1`，退出码 1。这是预期的失败信号，产品算法没有被修补。

逐步缩小输入：整页错误 → 仅截首行变正确 → 捕获原二值图与真实连通块 → 原分类函数重放单个点、固定字号，隔离到尺寸门。仅保留一个数字的裁图不再形成有效谱行，因此不能拿它的空识别结果作为修复成功。

```sh
node local/spikes/001-octave/classification-repro.mjs
```

原点框 `(350,269,7,6)`，墨像素 30。调用真实 `classify`：字号 14 时 `dotAccepted=false`，17 时为 `true`。这是约 0.1 秒的确定性反证；用实际原图块而非手造期望输出。裁首行经过重新编码，点框略有变化，故根因结论使用整页原始二值块验证。

## 根因与被排除的假设

先提出的四个假设分别是字号、上下点抵消、符号/文字排除、模型转换丢点。测得的实际方向是**字号偏小**，修正了起初对“可能偏大”的猜测。

- `app/src/omr/jianpu.ts` 的 `estimateNumH` 在多段中英文歌词页面上返回 14；目标行数字实际高约 17–18。
- 同文件 `classify` 的点门为宽、高均不超过 `numH * 0.45`。7 px 的宽超过 6.3 px，于是该点没有进入 `c.dots`，后续无法归给音符。
- `buildJpNums` 处记录到该音 `upDots=[]`、`downDots=[]`、`voiceMates=0`。没有上下点抵消；在进入输出模型前已错，因此不是转换/导出导致。
- 只在 `buildJpNums` 改本行字号无效，因为输入候选池已缺点。这是必须在候选分类与行归属之间修复的证据。

## 隔离实验与实测结果

`local/spikes/001-octave/build.mjs` 用 esbuild 加载钩子对源码副本做替换，生成本地 CLI bundle；**没有写回 `app/src`**。

| 方案 | 《星条旗》高音 do | 音级+八度序列编辑距离 | 实际音高+时值编辑距离 | 完全相同小节 / 13 |
| --- | --- | --- | --- | --- |
| 原算法 | 5 / 7 | 9 | 18 | 3 |
| 只在建音时改本行字号 | 5 / 7 | 9 | 18 | 3 |
| 分类点上限 0.45 → 0.60 | 7 / 7 | 0 | 7 | 6 |
| 按本行字号恢复漏掉的上点候选 | 7 / 7 | 5 | 18 | 3 |

独立人工转写参考：`local/test-cases/IMG_4548-reference.123`，39 个音符、13 小节。全局放宽候选使解析后的音符事件从 44 降为 39，避免部分附点被当成额外数字；音级和八度序列一致，但仍漏掉两处升号，时值也不全对。因此“音级+八度编辑距离 0”不能解释为声音完全正确。

度量是原谱与识别输出的序列 Levenshtein 编辑距离，**不是错误率百分比**；每个增删改计一步。实际音高由 Nota 的调号与临时升降号语义换算 MIDI 后比较。完全相同小节同时比较音级、八度、实际音高、时值。歌词没有计入这些指标。

《莫斯科郊外的晚上》只比较已独立核对的前 14 小节（37 个事件），不把末尾多段房号当成已验收：

- 原算法：实际音高+时值编辑距离 13，完全相同小节 2/14。
- 上述三个候选：仍为 13、2/14。
- 简单去绿色装饰：仍为 13、2/14。
- 最近邻放大两倍：距离 12，仍仅 2/14；不是可靠解决方案。

图中装饰包含深色墨迹，简单颜色过滤无法完整移除且可能伤及真点；没有尝试通过旋律常识凭空“纠正”八度。

对照：已有清晰《小星星》合成谱（42 个识别数字格），三个候选的音高/时值结果与原算法相同。**这只是一个负向对照，无法证明广泛不退化。**

### Safari 路径的边界

额外使用原 Safari `.dolce` 项目中保存的 `result/bin.raw` 重放同一几何识别链。两个输入的 baseline 数字框、音级、八度、附点、减时线、增时线均与项目保存的 `recognized.json` 完全相同；两个候选都恢复《星条旗》目标高音 do。见 `browser-replay.json`。

这验证了 Safari 实际保存像素上的问题及候选效果；不是在 Safari 中部署候选后的 UI 端到端验收。Node OCR 运行时仍不同，未承诺所有歌词和浏览器字节解码在各种输入上一致。

## 待审批的最小设计

1. **两阶段点归属**：保留原始小连通域的候选，不在整页字号阶段永久丢弃；识别数字行后使用本行数字高度复判。复用现有居中、间隙、墨占比、文字/连线排除和叠点规则，不另建音高模型。spike 的 `local-recover` 只证实可恢复上点，低点与误报仍需扩充样本。
2. **分歧显式复核**：原判与局部判不一致的音，附带点框、字号和理由，复用现有 `JpNum.doubt` / 原图定位校对入口。没有冲突也不等于已证明全对；不以旋律先验静默补音。现有 `oct.inkAbove` 未标出本次首个漏点，必须覆盖“候选池丢失”这一类。
3. **最小验收门**：本次七个高音 do、真实两图的音高/时值/结构回归、清晰谱及歌词碎笔/连线/低八度/双八度反例一起跑。仅完成八度修复就只报告八度修复，其他节奏和升号问题继续保留。
4. **输入质量退路**：装饰、低分辨率、点与连线粘连时建议使用原始清晰谱或结构化来源；校对确认仍是 MVP 工作流的一步。

候选与人工确认状态演示：`local/spikes/001-octave/review.html`，可双击打开。已在 Safari 实际点击：候选显示高音 do，直接尝试标记时仍保持“待复核”；演示不连接产品、数据库或真实曲库。

全局 0.60 虽在这一张图更好，但会扩大歌词碎笔、房号和装饰的候选范围；只有两个真实样本，不建议直接当成稳定修复合入。多尺度/多模型投票也不能独立证明正确，本次不引入。

## 复跑与证据

从项目根目录运行（使用现有依赖和本地 ONNX 模型，无新增产品依赖）：

```sh
node local/spikes/001-octave/build.mjs trace
node local/spikes/001-octave/build.mjs row-scale
node local/spikes/001-octave/build.mjs wide-pool
node local/spikes/001-octave/build.mjs local-recover
OMR_MODELS="$PWD/app/public/redist/ocr" node local/spikes/001-octave/probe.mjs trace
node local/spikes/001-octave/classification-repro.mjs
OMR_MODELS="$PWD/app/public/redist/ocr" node local/spikes/001-octave/matrix.mjs
OMR_MODELS="$PWD/app/public/redist/ocr" node local/spikes/001-octave/browser-replay.mjs
```

`semantics.ts` 通过本地 esbuild 打包为同名 `.mjs` 后运行，输出 `semantics.json`。`matrix.json`、完整中间结果、候选 `.123`、`classification.json` 均在该隔离目录。根目录 `npm test` 已通过 408 组转换、页脚、三连音排版与曲库测试；它们仅证明现有产品回归，不能替代本次准确性指标。

产品源码的主要调查位置：[jianpu.ts](../../app/src/omr/jianpu.ts)、[jpnums.ts](../../app/src/omr/jpnums.ts)、[recognize.ts](../../app/src/omr/recognize.ts)。没有新增生产依赖，没有把 spike 标记插入生产代码。

构建检查：`npm --prefix app run build -- --outDir ../local/spikes/build-check` 通过，输出定向到隔离目录；正式服务的 `app/out/dist` 未作为输出目标。隔离构建的首页与 manifest 字节与现有发布一致，库仍为 11 首。

最终结果断言：`node local/spikes/001-octave/verify-results.mjs` 已通过；可检查的候选 diff 为 `local-recover.patch` 和 `wide-pool.patch`，均仅保存在隔离目录。归档：独立仓库 `local/spikes`，分支 `spike/nota-001-002`，提交 `e36e176`。
