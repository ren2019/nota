# 002：联网搜结构化曲谱并验证导入

以下为审批前的 spike 验证记录。用户随后批准接入，已实施并部署的范围见 [接入记录](../integration-2026-10-16.md)。产品保留原生 ABC/MusicXML，并增加逐次起音、延音与连线检查；未采用本报告中的窄转换适配器。对应 [Issue 002](../issues/002-structured-score-import.md)。核验日期：2026-10-16（Asia/Shanghai）。

## 结论

可行。联网 agent 可以负责搜曲名、确认版本及来源、下载 ABC/MusicXML，再调用确定性的解析和比对脚本，生成待确认的 123 曲谱。清晰的结构化文件直接带音高、八度和时值，能绕开图片中“小八度点丢失”的识别问题。

本次实测来自 **MIT John Chambers、Project Gutenberg、OpenScore** 的三个样本，共 **87 小节、283 个源音符元素（其中 3 个倚音）**。转换后的逐小节 MIDI 音高与实际时值序列，与独立解析源文件所得序列一致；《摇篮曲》的三个倚音和末尾反复也一致。这里的“一致”是**与所选数字谱本一致**，并不证明所选数字谱本是唯一正确版本，也不证明来源转录没有错。

推荐先做“agent 找谱 → 生成候选和验证结果 → 人确认后入库”的小闭环。不要先做全网曲库搜索平台，也不要让同一个模型自己生成谱再宣称自己验对了。

## 有哪些实际可用的谱库

| 来源 | 结构化格式及许可证据 | 本次实际做了什么 | 对 Nota 的适合度 |
| --- | --- | --- | --- |
| [OpenScore Lieder](https://github.com/OpenScore/Lieder) | 仓库明确 **CC0**；[LICENSE.txt](https://github.com/OpenScore/Lieder/blob/38c5db510224d9facdc4b08d741fc788cfb58ea8/LICENSE.txt)。当前固定提交的树有 **1,462 个 MXL**，同时有 MSCX/MSCZ、逐曲 README、原印刷来源链接。 | 下载勃拉姆斯 Op.49 No.4《摇篮曲》MXL，提取明确的声乐 P1，通过独立 XML 对照。 | 许可及元数据清楚；偏 19 世纪艺术歌曲，不是完整的通俗儿歌或现代国歌库。当前已有 GitHub 直接下载，无需依赖 MuseScore 网页下载。 |
| [John Chambers ABC collection](https://trillian.mit.edu/~jc/music/abc/) | ABC 纯文本，大量传统曲/民歌/国歌；必须逐文件核对来源与权利说明。不是整个目录统一开源许可。 | 下载《星条旗》1919 Service Version 四声部 ABC，明确选择 V:1；另下载原始《马赛曲》作为失败样本。 | ABC 最轻，能复用 Nota 现有解析器；多声部、装饰快捷符和原始录入错误都需要校验。 |
| [Project Gutenberg](https://www.gutenberg.org/ebooks/69486) | 部分含乐谱的书提供 MusicXML/MXL，并非所有书都提供。此书标注 **Public domain in the USA**；这是书籍所在地权利说明，不等于全球逐曲许可审查完成。 | 从 1920 年《Through Bolshevik Russia》附录实际下载《国际歌》MXL并验证。 | 数量及搜索体验有限，但原始版本、转录者和书本出处可追溯。 |
| [Mutopia](https://www.mutopiaproject.org/) | 官方提供 PDF、MIDI、可编辑 LilyPond；逐曲有 PD 或 CC 许可，见[许可说明](https://www.mutopiaproject.org/legal.html)。 | 实际下载 Horetzky 第 21 首《Au Clair De la Lune》和第 56 首《Chanson Des Marseillois》的 `.ly`，文件内写明 typesetter 放入 Public Domain。**未做 LilyPond→Nota 转换验证。** | 可作为高质量候选来源。LilyPond 不是当前 spike 的直接导入格式；先找其 MusicXML/ABC 对应版，或另做受控转换。历史“National Airs”不能自动当作现行国歌。 |
| [PDMX](https://github.com/pnlong/PDMX) | 官方称 25 万余首 public-domain MusicXML；官方同时披露 **12.29%（31,221 首）许可元数据冲突**，建议 `no_license_conflict` 子集；还有 `all_valid` 文件完整性子集。 | 读取官方 README 并保存证据。**未下载大数据集、未验证任一首 PDMX 曲目。** | 可作为后续候选索引；先筛许可无冲突且文件有效，再逐曲验证。不能把数据集标签当逐曲保证。 |

OpenScore 的格式分发说明见[官方站点](https://fourscoreandmore.org/openscore/)；GitHub 是版本记录，另一个站点提供压缩格式。本次下载固定到 `38c5db510224d9facdc4b08d741fc788cfb58ea8`，避免 main 变化导致复现不一致。树 API 下载保存于 `sources/openscore-tree.json`，其 `truncated=false`，1,462 是本次实际文件计数。

对《义勇军进行曲》，本轮搜索找到的可靠标准来源仍是[香港政制及内地事务局国歌页面](https://www.cmab.gov.hk/sc/issues/national_anthem.htm)的 PDF；**本轮没有确认到与标准谱一致、许可清楚、可直接下载的 MusicXML/ABC**。这表示本轮尚未找到，不表示网上不存在。不能为了凑齐名单，拿同名第三方 MIDI 或模型生成曲谱代替标准版本。

## 实际输入、转换与结果

所有文件在 `local/spikes/002-structured-score-import/`，原始文件在 `sources/`。`sources/retrieval-current.json` 记录实际 URL、HTTP 200、Content-Type、下载时间、字节数与 SHA-256；它们是本轮重新联网下载的文件，未借用已入库的人工修正版来充当自动结果。

| 曲名 / 原文件 | 明确选取的范围 | 源元素 / 小节 | 验证结果 |
| --- | --- | --- | --- |
| 《星条旗》1919 Service Version / `sources/usa.abc`，7,092 B | 四声部中的 V:1；保留 Bb 原调与音区。显式去除力度、文字等非音高装饰，不使用模型重新抄谱。 | 105 / 34 | Nota ABC→123→解析的声音序列，与独立 music21 ABC 解析全等；0 拍数问题、0 解析诊断。源无反复。 |
| 《国际歌》1920 谱本 / `sources/internationale.mxl`，9,345 B | 唯一的 Choir / P1；C 调。严格的实验 XML→ABC 适配器，再调用 Nota ABC→123。 | 124 / 34 | 直接 XML 音高/八度/时值 oracle 与 music21 XML oracle 先互相一致，再与 Nota 结果全等；0 拍数问题、0 诊断。源无反复。 |
| 勃拉姆斯《摇篮曲》Op.49 No.4 / `sources/brahms.mxl`，8,187 B | `Singstimme` / P1；排除 P2 钢琴伴奏，保留 Eb 原调和原音区。 | 54（含 3 倚音）/ 19 | 两个 XML oracle 和 Nota 结果一致；3 倚音 MIDI 为第 15 小节 67、第 18 小节 70、68；第 19 小节 backward repeat 与源一致；0 拍数问题、0 诊断。 |
| 《马赛曲》原始 ABC / `sources/marseillaise.abc`，1,557 B | **不修复，故意验证未经整理的原始下载**；和弦、歌词、延音及源时值保持原样进入解析器。 | music21 32 小节，Nota 33 小节 | **拒绝候选**。Nota 自身 round-trip 一致，但独立源解析不同，有 19 个诊断、7 个拍数告警，说明“能解析并回写”不足以验收。 |

三个通过样本的范围共 87 小节；283 是源文件的 note 元素计数，包含延音拆分的源元素，不应解释为 283 次独立演奏起音。详细差异、每小节事件、源/输出小节线和反复，分别在 `expected.json`、`verification.json`。

《星条旗》源文件明确标注来自 1919 年书籍，且转录者声明其材料在美国属于公有领域；**没有发现整个 ABC 目录的统一转录许可**。候选清单保留这一待审项。《国际歌》的 USA PD 范围也保留待审。OpenScore 的 CC0 文件已实际下载并核对。

## 两个解析器是否独立

不是让 Nota 解析后再用 Nota 推导“参考答案”。

- ABC：独立包 **music21 10.5.0** 解析选定源声部；Nota 使用其现有 TypeScript ABC parser。两者不是同一解析器实现。
- MusicXML：Python 标准库 ElementTree 直接读取 `step/alter/octave`，按 `12×(octave+1)+pitchClass+alter` 得 MIDI，按 `duration/divisions` 得实际四分音符时值；另用 **music21 的 MusicXML parser** 交叉确认整段声音序列，再与 Nota 生成的 123 对照。
- Nota：真正调用仓库 `parseAbc`、`emit123`、`parse123`、`AccidentalCarry` 和 `checkMeasureDurations`。没有修改它们。
- 同一源码 `ABC→123→ABC/123` 的自洽性单列为 `notationRoundtripEqual`；外部源对照另列为 `oracleEqual`。失败的《马赛曲》正好说明二者不同。

有一个需要明确的预处理前提：《星条旗》源 ABC 的 `U:` 定义包含自定义非音高快捷符。music21 对其中部分符号不能正确解释。本次在 `prepare.py` 中显式选 V:1，并去除这些**非音高装饰**与文字标记，留下可检查的 `usa-melody.abc`；两种 parser 读取同一份已记录的选择结果。这个 spike 证明选定旋律的音高/节奏转换，不证明任意多声部 ABC 都能无损导入。

## 坏数据拦截：可复现的反例

在通过样本上执行以下单变量变异；没有让 LLM 用“听起来对”来打分。

| 注入错误 | 音符数 | 语法检查 | 拍数检查 | 真正拦住它的检查 |
| --- | --- | --- | --- | --- |
| 《国际歌》第 2 小节的高音 `1'` 改为普通 `1`，只丢一个八度点 | 不变 | 通过 | 0 告警 | 外部源 MIDI 序列不同，检测成功 |
| 《国际歌》首音 `5` 改为 `6`，时值不变 | 不变 | 通过 | 0 告警 | 外部源 MIDI 序列不同，检测成功 |
| 《摇篮曲》末尾 `:|` 改为 `|` | 不变 | 合法谱文 | 0 告警 | 源反复结构不同，检测成功 |
| 《国际歌》第 2 小节加入一个四分休止 | 增加一个休止 | 合法谱文 | 第 2 小节 5 拍 / 应为 4 拍 | 小节时值检查成功 |

因此，**音符数、能 parse、每小节拍数正确，都不能防止高音 do 变普通 do**。有结构化原始源时，应把逐段 MIDI 音高（必须含八度）与时值对照作为准入条件。

## MVP 中 agent 可以执行的工作流

1. 用户给曲名。agent 查中文/原文别名、作者、版本，例如区别美国国歌 *The Star-Spangled Banner* 和 Sousa 的 *The Stars and Stripes Forever*；后者虽也有[现成 Mutopia 源码](https://www.mutopiaproject.org/ftp/SousaJP/TheStarsAndStripesForever/)，却是另一首曲子。
2. 优先查 OpenScore 等许可明确来源；传统歌可查 ABC，保存逐曲出处。只把实际下载成功、文件内容与格式相符的条目列为候选。下载扩展名不能代替文件验证。
3. 在隔离暂存目录保存原文件、内容哈希、许可依据、原版本、目标声部。显式选择单旋律，原调和音区默认保持；不默默移低八度或取“最高音链”。
4. 调用确定性 importer 生成 Nota 的现有 123 表示，立即运行语法诊断、拍数检查及**独立源 MIDI/时值/小节线/反复对照**。有差异先拒绝或标待核，不由 agent 自动“改到拍数对”。
5. 输出可编辑候选与报告：来源、许可、选择声部、验证范围和待审项。用户确认后才执行现有入库流程。这次只生成 `import-candidates.json`，`approved=false`，没有调用库写入 API。

实现上最小增量可以是一个受控 agent 导入任务和候选文件，不必先在产品中加新曲库页面或用户系统。复用 Nota 现有 123 与 MusicXML 模型，验证时的 MIDI 数组只是临时比较值，不成为产品的第二份持久化音高模型。

## 已证明的范围与未覆盖项

已证明：三个真实在线数字谱，在明确选定声部、保持原调和音区后，能获得与数字源相同的声音时间线；独立源对照能拦住拍数合法的单音八度/错音错误；普通末尾反复与 3 个倚音能验证。

为比较延音等价写法，本次将**同一小节内相邻、同 MIDI 的段落合并**后比较时值，因此当前指标**不检验同音连打与延音之间的起音差异**。它也不是完整的 tie/slur、歌词、速度、力度或排版保真测试。XML 实验适配器保留普通音符、休止、倚音、时值、tie 和普通反复写法，但未完整搬运 XML 的连音线、歌词和力度；两个 XML 样本没有源 tie。房号、多声部重叠、移调乐器、变拍号、复杂跳转没有通过此适配器验收，脚本对若干不支持结构显式拒绝。

**不建议把这个窄 XML→ABC 适配器直接合入产品。** 批准后应复用 Nota 现有 MusicXML 入口，并用本次独立 oracle 验证真正入口，同时补上同音起音、连线和房号检查。当前结果属于导入可行性验证，尚未做原生 MusicXML 浏览器导入端到端或最终 PDF 的目视验收；Mutopia LilyPond 转换、PDMX 实际曲目导入均未测。

数字源本身可以写错八度，两个 parser 也会忠实保留这个错误。要证明“这就是标准版本”，还需要独立谱本/官方谱面或人工音乐校对；搜索到的多个镜像也可能复制同一处错，不能当多个独立证据。模型可以帮找与解释差异，但不能用它自己的判断替代这些外部证据。

## 复现

以下命令均从仓库根执行，仅写 `local/spikes/002-structured-score-import/`；不启动产品、不改应用、不写共享库。music21 仅由 `uv` 放进实验依赖缓存，未加到 app 依赖中。

```sh
python3 local/spikes/002-structured-score-import/fetch.py
uv run --with music21==10.5.0 python local/spikes/002-structured-score-import/prepare.py
app/node_modules/.bin/esbuild local/spikes/002-structured-score-import/verify.ts --bundle --platform=node --format=esm --outfile=local/spikes/002-structured-score-import/verify.mjs
node local/spikes/002-structured-score-import/verify.mjs
```

证据：`sources/retrieval-current.json`（网络和哈希）、`sources/*-page.json`/其他网页 JSON（remio clean markdown；文件名以实际目录为准）、`expected.json`（独立源序列）、`verification.json`（逐小节比对及反例）、`import-candidates.json`（待批准清单）、生成的三个 `.123` 候选。预期三个样本 `semantic-pass-await-review`，原始《马赛曲》`blocked`，四个反例均被对应检查拦截。

下一步需要批准的具体范围：将“选定来源的结构化谱 → 暂存候选 → 独立验证 → 用户确认后入库”接入现有产品；先支持 ABC 和现有 MusicXML 导入路径，LilyPond 转换与大型曲库索引后置。本轮到此停止。
