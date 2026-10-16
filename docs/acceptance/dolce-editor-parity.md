# Nota 完整 Dolce 编辑页对照

规格 [#9](https://github.com/ren2019/nota/issues/9)，实施 [#11](https://github.com/ren2019/nota/issues/11)。固定上游为 Dolce 0.8.3 / `2aab8ef2333ba9e1a2a7b342080381fcacdd41ac`；对照同时包含 Nota main `776498b` 已有的全局简谱输出及两行页脚，不用上游旧输出覆盖这些新增能力。

独立专业页沿用原来的 App、CodeMirror、OMR、播放器、记号面板、四种视图与整套 DOM。原工具栏和原 CSS 的 680/900 断点保留；手机依旧使用原「源码 / 预览」切换。详情底部「编辑」进入专业页，新增身份条的「返回曲谱详情」回到同首编辑态，切页不重新导入、不销毁编辑器/撤销历史、不复制一份正文。新增 Nota 调式不进入原记号板；调式使用详情的专属入口。

## 功能与入口

以下“保留”表示已核对原源码入口、处理器与能力条件；实际操作结果另列，避免把入口存在当作端到端通过。

| 功能 | 专业页保留的入口 / 实现 | 原支持条件与范围 |
|---|---|---|
| 源码与谱面双向编辑 | `#code-pane`、`#score-pane`；App.mountEditor、sync.ts、visual/controller.ts | 文字格式沿用原映射；MusicXML 无文本源码区，走模型编辑；不新造可编辑 XML 文本框 |
| 编辑/插入与选择 | `#btn-palette` 原记号板、谱面点击/键盘、visual/keys.ts 全部 VISUAL_ACTIONS | 不手抄缩减 actions；保留原格式 dialect 的 available gating |
| 音符/休止/改音/八度/升降/时值/附点/三连音 | 原记号板、数字/字母及快捷键；visual/ops.ts | 按原格式与编辑/插入状态启用；原内置变换仍保留 |
| 记号/延音/连线/反复/歌词/和弦 | 原记号板、原上下文菜单、双击可编辑文字；visual/menu.ts、lyrics.ts、inline.ts | 保留原格式能力；不把简谱文字格式的限制算作 IA 删功能 |
| 小节/结构、声线、换行/换页 | 原谱面上下文菜单及 VISUAL_ACTIONS meas/voice/brk；measureops.ts、breaks.ts、moves.ts | 全部原 actions 保留 |
| 撤销/重做、快捷键/剪贴板/上下文菜单 | 原 CodeMirror history/keymap、谱面键盘和右键菜单 | 页面往返保留同一 view/history；详情看谱屏只读，去专业页编辑 |
| 声部结构管理 | 顶栏「声部」`#btn-parts`；parts.ts / App.editParts | MusicXML/123/ABC 可改结构；文本谱/JP-Word 沿用原试听能力 |
| 静音/独奏/音量、旋律/歌词来源 | 同一个原声部面板；PlaybackController | 音量等仍为会话状态，保留原持久化范围 |
| OMR 原图/疑点与对照 | 原图页按钮 `#btn-src-pages`、核对下拉 `#sel-compare`、`#btn-doubt`、`#btn-recognize` | 仅带 OMR 原图时出现；并排/片段/浮窗/原位/原图模式按原条件可用；新增区域标签不进入导出 |
| 原图排序/增删/旋转/裁剪/重识别、项目恢复 | 原原图页对话框；omrpages.ts / OmrController / `.dolce` | 不扩充新识谱引擎；五线谱项目首次需要对照时，仍按原机制补回逐页对照数据，不冒充已验证自动识别准确 |
| 分行、原样/展开/五线谱/混排四视图 | 原工具栏 `#layout-mode-switch` 与 `#view-mode-switch` | 档位仍是 App.viewMode，与详情练习/编辑态相互独立；各格式原能力条件不变 |
| 拍数自检/格式标记/来源格式 | 原 `#btn-beat-check`、`#btn-format-marks`、`#sel-doc-format` | 保留原行为和格式来源选择 |
| 播放/暂停/停止/进度/速度/循环/节拍器 | 原 `#btn-play`、`#btn-stop`、`#play-progress`、`#sel-speed`、`#btn-loop`、`#btn-metronome` | 同一真实播放器；进入编辑先停止，不自动续播；详情播放 UI 由 #13 接续 |
| 分页/缩放、源码显隐 | 原状态栏 `#btn-prev/next`、缩放按钮、`#chk-code`，原滚轮/捏合 | 原样动态适应；源码能力仍服从 no-code/hide-code，不被新 IA 强制覆盖 |
| 设置/帮助/简繁/语言 | 顶栏原 `#btn-options/help/hanzi`；手机仍在原顶栏「…」 | 设置各 tab 全保留；新增当前排版档、浏览器保存范围及恢复范围说明，不改变恢复语义 |
| 打开/拖入各原格式 | 原首页导入入口、专业页拖入；FileSession.openFile / App.importBytes | 上游专业页本来就没有独立 #btn-open DOM，不伪造删功能；可从原首页选择文件；T3 统一替换保护 |
| 保存/另存/项目/有损提示 | 顶栏「保存入库」衔接及原「另存为」`#btn-saveas`；FileSession、showSaveAsDialog | 另存当前格式、全部原转换目标、带原图时识别项目均可达；保留 planSave 损失提示；下载 .123 不等于含原图项目 |
| 导出全部既有格式 | 顶栏 `#btn-export`；原 EXPORT_ITEMS / showExportDialog | PNG/PDF/PPTX/MIDI/MusicXML/jianpu-ly 与 Nota 123 沿用原 available 条件；紧凑导出重组由 #15 做，不删其余格式 |
| 自动草稿/关闭保护/恢复 | 原 FileSession 与关闭事件 | 专业页返回不会清稿/markClean；跨记录保护由 #12 强化，完整项目和文本下载的区别保留 |

源码对照时，固定上游 index.html 的 **79 个 id** 在当前专业 DOM 中全部存在（当前 81 个），无缺失。此项只作结构证据，不独立证明交互正确。T2 没有删除/重写 App、visual、parts、filesession、export、omr 引擎，也没有修改原 styles.css 断点。

## 验证与边界

自动回归：`npm test`（真实 123/ABC/JP-Word/文本谱、混排 painter、MIDI/源位置、项目序列化/临时曲库、播放控制回归）及 `npm run build`。测试不使用 FakeApp 或模拟曲谱来宣称原编辑器通过。

实际浏览器旅程必须记录：从库进练习 → 编辑态 → 独立专业页；改一个音 → 回详情 → 再进专业并撤销/重做；浏览器返回；核对实际谱面、格式、库名/印刷标题、dirty 与原图保持。再检查声部/帮助/设置/另存/导出、原记号板与上下文入口，以及 360/390/430/桌面源码/预览切换。根协调代理使用隔离测试库执行 CUA；结果见其本轮验收记录，未执行项不标为已通过。

真机 iPhone/Android 的软键盘、音频、后台、文件挑选/下载/分享与系统打印仍属于 #19；桌面容器不能替代真机验证。原 OMR 识别质量与各格式能力限制不因本次 IA 改变。
