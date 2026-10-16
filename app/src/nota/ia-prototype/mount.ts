// THROWAWAY: Three structurally different IA variants on /?variant=A|B|C.
// Question: which structure best serves making/printing first, phone practice
// second, and occasional expert editing third? All state is in memory.
import "./prototype.css";
import { notaLogo, logoNames } from "./logos";
import { mountDolceWorkspace } from "./dolce-workspace";

type Variant = "A" | "B" | "C";
type Scene = "new" | "review" | "practice";
const names = { A: "引导式制谱", B: "曲子详情 · 双态", C: "制作 / 练习双空间" };
const steps = ["带入曲谱", "校对原谱", "调整练习谱", "排版与交付"];
const titles = ["小星星", "两只老虎", "莫斯科郊外的晚上", "字母歌", "苏珊娜", "义勇军进行曲", "国际歌", "摇篮曲", "马赛曲", "星条旗", "苏联国歌", "小星星 · 原图校对"];
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
let variant: Variant = "A", scene: Scene = "review", phone = false, compare = false;
let phoneWidth = 390, logoVersion = 1;
let s = fresh();
let root: HTMLElement;
function fresh() {
  return { title: "小星星", loaded: true, source: "示例图片", step: 1, doubts: 2,
    mode: "renotate", target: "C", applied: false, font: "大字", lyrics: true, paper: "A4 · 竖向",
    library: titles.slice(0, 4), saved: false, playing: false, inspector: "校对", space: "制作", page: "work",
    sourceCode: false, original: true, selected: 0, query: "", searched: false,
    notice: "", output: "PDF", note: "", panel: false, speed: "1×", looping: false, dolceMode: "edit", dolceOriginal: false };
}
function btn(text: string, action: string, kind = "", val = "") {
  return '<button class="' + kind + '" data-act="' + action + '" data-val="' + esc(val) + '">' + text + "</button>";
}
function chip(text: string, cls = "") { return '<span class="chip ' + cls + '">' + text + "</span>"; }
function brand() {
  return '<a class="brand" href="?variant=' + variant + '" title="查看 Logo 方案" data-act="logos">' + notaLogo(logoVersion) + '<span>Nota<small>轻松制作乐谱<span lang="en">A simple way to make sheet music.</span></small></span></a>';
}
function github() { return '<a class="github" href="https://github.com/ren2019/nota" target="_blank" rel="noreferrer" aria-label="Nota GitHub 项目"><svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true"><path fill="currentColor" d="M12 1a11 11 0 0 0-3.48 21.44c.55.1.75-.24.75-.53v-2.05c-3.06.66-3.7-1.3-3.7-1.3-.5-1.27-1.22-1.61-1.22-1.61-1-.68.08-.67.08-.67 1.1.08 1.68 1.13 1.68 1.13.98 1.68 2.57 1.2 3.2.92.1-.71.38-1.2.7-1.47-2.44-.28-5-1.22-5-5.44 0-1.2.43-2.18 1.13-2.95-.12-.28-.49-1.4.1-2.91 0 0 .92-.3 3.03 1.13a10.4 10.4 0 0 1 5.5 0C17.08 5.26 18 5.56 18 5.56c.6 1.51.23 2.63.12 2.91.7.77 1.12 1.75 1.12 2.95 0 4.23-2.57 5.16-5.02 5.43.4.35.75 1.02.75 2.06v3c0 .3.2.64.76.53A11 11 0 0 0 12 1Z"/></svg></a>'; }
function docHead() {
  return '<div class="doc-id"><span class="eyebrow">正在制作</span><h1>' + (s.loaded ? esc(s.title) : "新建曲谱") + '</h1><span class="muted">' + (s.loaded ? "原谱 1=E♭ · 4/4 · 8 小节（演示）" : "带入曲谱后开始制作") + '</span></div><div class="doc-actions">' + chip(s.saved ? "已模拟保存" : "未保存", s.saved ? "ok" : "warn") + (s.loaded ? btn("保存到曲谱库", "save", "secondary") : "") + "</div>";
}
function header(extra = "") {
  return '<header class="product-head">' + brand() + '<nav>' + btn("体验", "demo", "text") + extra + github() + "</nav></header>";
}
function sourceChooser() {
  return '<section class="source-chooser"><span class="eyebrow">从一份曲谱开始</span><h2>你手边的曲谱是什么？</h2><p class="muted">选好来源后再调整原图、识别和校对。</p><div class="source-options">' +
    btn('<span class="source-symbol">▧</span><strong>图片识谱</strong><small>照片、截图、PDF</small>', "source", "source-option", "图片") +
    btn('<span class="source-symbol">♫</span><strong>导入乐谱</strong><small>123、ABC、MusicXML 等</small>', "source", "source-option", "数字谱") +
    btn('<span class="source-symbol">⌕</span><strong>联网查谱</strong><small>搜索已接入的 OpenScore 曲库</small>', "find", "source-option") + '</div><div class="quiet-links">' + btn("使用小星星示例", "demo", "text") + btn("新建空白谱", "source", "text", "空白谱") + "</div></section>";
}
function original() {
  return '<section class="original"><div class="section-head"><span>原图对照</span>' + chip("演示原图") + '</div><div class="scan"><h3>小 星 星</h3><p>1=E♭　4/4</p><div>1 1 5 5 │ 6 6 <mark>5 −</mark><br><small>一 闪 一 闪　亮 晶 晶</small></div><div>4 4 3 3 │ 2 2 1 −<br><small>满 天 都 是　小 星 星</small></div></div></section>';
}
function score(large = false) {
  const rows = [
    ["1 1 5 5", "6 6 5 −", "一 闪 一 闪", "亮 晶 晶"],
    ["4 4 3 3", "2 2 1 −", "满 天 都 是", "小 星 星"],
    ["5 5 4 4", "3 3 2 −", "挂 在 天 上", "放 光 明"],
    ["5 5 4 4", "3 3 2 −", "好 像 许 多", "小 眼 睛"]
  ];
  return '<section class="score-wrap"><div class="section-head"><span>' + (s.applied ? "练习谱预览" : "谱面预览") + '</span><span class="muted">简谱 · 演示排版</span></div><article class="sheet ' + (large ? "large" : "") + '"><h2>' + esc(s.title) + '</h2><div class="sheet-meta"><span>1=' + (s.applied ? esc(s.target) : "E♭") + '　4/4</span><span>传统旋律</span></div>' +
    (s.applied ? '<p class="preview-note">已演示应用：' + (s.mode === "renotate" ? "保持音高，换记谱基准" : "实际移调") + '。下方为占位谱面，不是转换结果。</p>' : "") +
    rows.map((r, i) => '<div class="music-line ' + (s.playing && i === 0 ? "sounding" : "") + '"><div class="bar"><b>' + r[0] + '</b>' + (s.lyrics ? '<small>' + r[2] + "</small>" : "") + '</div><div class="bar"><b>' + r[1] + '</b>' + (s.lyrics ? '<small>' + r[3] + "</small>" : "") + "</div></div>").join("") +
    '<footer>Nota · Made with Dolce</footer></article></section>';
}
function player() {
  return '<div class="player" aria-label="练习播放控制">' + btn(s.playing ? "Ⅱ 暂停" : "▶ 试听", "play", "play") + '<span class="player-track"><i class="' + (s.playing ? "moving" : "") + '"></i></span><span class="time">' + (s.playing ? "0:08" : "0:00") + ' / 0:33</span><label>速度<select data-field="speed" aria-label="试听速度"><option>原速</option><option>0.75×</option><option>0.5×</option></select></label>' + btn("循环", "loop", "secondary") + "</div>";
}
function correction() {
  if (!s.doubts) return '<section class="control-section"><span class="eyebrow">先核对，再转换</span><h2>本轮演示校对已完成</h2><p class="muted">两处演示问题已确认，可以继续调整练习谱。</p>' + btn("继续调整练习谱 →", "later", "primary") + '<details><summary>更多编辑工具</summary>' + expert() + '</details></section>';
  return '<section class="control-section"><span class="eyebrow">先核对，再转换</span><h2>' + (s.doubts ? "还有 " + s.doubts + " 处需要你确认" : "本轮演示校对已完成") + '</h2><p class="muted">对照原图检查八度、节奏和音符。识别结果需人工核对。</p><div class="doubt"><span class="dot"></span><div><strong>第 ' + (s.selected ? "7" : "2") + ' 小节 · 第 3 拍</strong><p>请对照原图确认时值</p></div>' + btn("定位", "locate", "secondary") + '</div><div class="row">' + btn("这处正确，下一处", "resolve", "primary") + btn("稍后处理", "later", "text") + "</div><details><summary>更多编辑工具</summary>" + expert() + "</details></section>";
}
function expert() {
  return '<p class="muted">偶尔改谱时再展开；保留 Dolce 的专业编辑能力。</p><div class="row">' + btn(s.sourceCode ? "隐藏源码" : "查看源码", "code", "secondary") + btn("记号面板", "notice", "secondary", "原型仅演示专业工具入口层级。") + btn("声部与歌词", "notice", "secondary", "此处承接 Dolce 的声部、歌词和可视化编辑工具。") + '</div>' + (s.sourceCode ? '<pre class="code">X:1\nT:小星星\nM:4/4\nK:1=bE\n1 1 5 5 | 6 6 5 - |\nw:一闪一闪亮晶晶</pre>' : "");
}
function conversion() {
  return '<section class="control-section"><span class="eyebrow">做成适合练习的谱</span><h2>怎样调整这份曲谱？</h2><label class="choice"><input type="radio" name="conversion" data-field="mode" value="renotate" ' + (s.mode === "renotate" ? "checked" : "") + '><span><strong>保持声音，换记谱基准</strong><small>实际音高与音区不变，重新计算数字和升降号</small></span></label><label class="choice"><input type="radio" name="conversion" data-field="mode" value="transpose" ' + (s.mode === "transpose" ? "checked" : "") + '><span><strong>实际移调</strong><small>数字关系保留，声音随目标调改变</small></span></label><label class="field">目标基准<select data-field="target"><option ' + (s.target === "C" ? "selected" : "") + '>C</option><option ' + (s.target === "D" ? "selected" : "") + '>D</option><option ' + (s.target === "F" ? "selected" : "") + '>F</option><option ' + (s.target === "G" ? "selected" : "") + '>G</option></select></label>' + btn("应用并预览", "apply", "primary full") + '<p class="muted">' + (s.applied ? "已演示应用，可还原到原谱。" : "应用前原谱保持不变。") + "</p>" + (s.applied ? btn("还原到原谱", "undo", "text") : "") + "</section>";
}
function output() {
  return '<section class="control-section"><span class="eyebrow">一份清楚的练习谱</span><h2>排版与交付</h2><div class="settings-grid"><label class="field">纸张<select data-field="paper"><option>A4 · 竖向</option><option>A4 · 横向</option></select></label><label class="field">数字大小<select data-field="font"><option ' + (s.font === "标准" ? "selected" : "") + '>标准</option><option ' + (s.font === "大字" ? "selected" : "") + '>大字</option><option ' + (s.font === "特大" ? "selected" : "") + '>特大</option></select></label></div><label class="check"><input type="checkbox" data-field="lyrics" ' + (s.lyrics ? "checked" : "") + '>显示歌词</label><p class="muted">A4 · ' + esc(s.font) + ' · ' + (s.lyrics ? "含歌词" : "无歌词") + ' · 1 页（演示）</p><div class="output-actions">' + btn("下载 PDF / 打印", "export", "primary", "PDF") + btn("分享 PNG", "export", "secondary", "PNG") + "</div><hr><h3>保留可编辑稿</h3><p class='muted'>保存到当前家庭 Nota 曲谱库，连接同一服务的家人可访问。</p>" + btn(s.saved ? "已模拟保存到曲谱库" : "保存到曲谱库", "save", "secondary full") + '<details><summary>下载可编辑文件与其他格式</summary><div class="row">' + btn("123 源文件", "export", "text", "123") + btn("MusicXML", "export", "text", "MusicXML") + btn("PPTX / MIDI", "export", "text", "PPTX / MIDI") + "</div></details></section>";
}
function library(practice = false) {
  const items = variant === "B" ? s.library : titles.slice(0, practice ? 6 : 4);
  return '<div class="section-head"><h2>' + (practice ? "选一首，开始练习" : "家庭曲谱库") + '</h2><span class="muted">' + items.length + ' 首演示曲谱</span></div><div class="score-list">' + items.map((t) => '<button class="score-row" data-act="' + (practice ? "practice" : "open") + '" data-val="' + esc(t) + '"><span class="score-icon">♫</span><span><strong>' + esc(t) + '</strong><small>' + (t === s.title && variant === "B" ? "1=" + (s.applied ? esc(s.target) : "E♭") + " · 4/4" : t === "小星星" ? "1=E♭ · 4/4" : "1=C · 4/4") + ' · ' + (t === "小星星" && !practice ? "上次停在校对" : "可直接打开") + '</small></span><span class="row-tail">' + (practice ? "练习 →" : "打开 →") + "</span></button>").join("") + "</div>";
}
function practice() {
  return '<div class="practice-header">' + btn("← 返回", "back", "text") + '<strong>' + esc(s.title) + '</strong>' + btn("修改曲谱", "edit", "secondary") + '</div><p class="muted compact">只读练习视图 · 点击工具不会改谱</p>' + player() + score(true);
}
export function VariantA() {
  if (s.page === "library") return header(btn("返回制作", "back", "text")) + '<main class="b-library">' + library() + sourceChooser() + "</main>";
  if (scene === "practice" || s.space === "练习") return header() + '<main class="practice-space">' + practice() + "</main>";
  return header(btn("家庭曲谱库", "library", "text")) +
    '<div class="a-title"><span class="eyebrow">一份曲谱，四个清楚的步骤</span><div class="doc-row">' + docHead() + '</div></div><nav class="stepper" aria-label="制谱步骤">' + steps.map((t, i) => '<button data-act="step" data-val="' + i + '" class="' + (i === s.step ? "current" : "") + '" aria-current="' + (i === s.step ? "step" : "false") + '"><i>' + (i < s.step ? "✓" : i + 1) + '</i><span>' + t + "</span></button>").join("") + '</nav><main class="a-main">' +
    (!s.loaded || s.step === 0 ? sourceChooser() + '<section class="recent">' + library() + '</section>' :
      '<div class="a-work"><aside>' + (s.step === 1 ? correction() : s.step === 2 ? conversion() : output()) + '</aside><div class="a-preview">' + (s.step === 1 && s.original ? original() : "") + score() + '</div></div><div class="step-actions">' + btn("← 上一步", "prev", "secondary") + '<span class="muted">' + (s.doubts && s.step > 1 ? "还有 " + s.doubts + " 处待复核" : "随时可以返回前一步") + '</span>' + (s.step < 3 ? btn(s.step === 1 ? "继续：调整练习谱 →" : "继续：排版与交付 →", "next", "primary") : btn("进入练习 →", "practice", "primary", s.title)) + "</div>") + "</main>";
}
// B iteration: one song detail, two modes; phone tools open over the canvas.
function glyph(name: string) {
  const paths: Record<string, string> = {
    back: '<path d="m14 6-6 6 6 6"/>',
    check: '<path d="m8 12 3 3 5-6"/><rect x="4" y="4" width="16" height="16" rx="4"/>',
    edit: '<path d="m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14v6Z"/>',
    tune: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    share: '<path d="M12 15V3m-4 4 4-4 4 4M5 13v7h14v-7"/>',
    play: '<path d="m9 5 11 7-11 7Z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
    reset: '<path d="M5 5v14m14-14-10 7 10 7Z"/>',
    loop: '<path d="m16 3 4 4-4 4M4 11V7h16M8 21l-4-4 4-4m12 0v4H4"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>'
  };
  return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.more) + '</svg>';
}
function detailTool(label: string, icon: string, tool: string) {
  return btn(glyph(icon) + '<span>' + label + '</span>', "detailTool", s.panel && s.inspector === tool ? "selected" : "", tool);
}
function compactConversion() {
  return '<section class="bd-compact"><div class="bd-conversion-choices">' +
    ['renotate','transpose'].map((mode, i) => '<label class="bd-radio"><input type="radio" name="conversion" data-field="mode" value="' + mode + '" ' + (s.mode === mode ? 'checked' : '') + '><strong>' + ['保持音高，换记谱基准','实际移调'][i] + '</strong></label>').join('') +
    '</div><label class="bd-inline-field">目标基准<select data-field="target">' + ['C','D♭','D','E♭','E','F','F♯','G','A♭','A','B♭','B'].map(k => '<option ' + (s.target === k ? 'selected' : '') + '>' + k + '</option>').join('') + '</select></label><p class="bd-short-help">' + (s.mode === 'renotate' ? '声音与音区不变，重算数字和升降号。' : '声音随目标调改变，保留数字关系。') + '</p>' + (s.applied ? btn('还原到原谱', 'undo', 'text') : '') + '</section>';
}
function compactOutput() {
  return '<section class="bd-compact"><div class="bd-output-fields"><label>纸张<select data-field="paper"><option ' + (s.paper === 'A4 · 竖向' ? 'selected' : '') + '>A4 · 竖向</option><option ' + (s.paper === 'A4 · 横向' ? 'selected' : '') + '>A4 · 横向</option></select></label><label>字号<select data-field="font">' + ['标准','大字','特大'].map(v => '<option ' + (s.font === v ? 'selected' : '') + '>' + v + '</option>').join('') + '</select></label></div><label class="check"><input type="checkbox" data-field="lyrics" ' + (s.lyrics ? 'checked' : '') + '>显示歌词</label><div class="bd-output-buttons">' + btn('PDF / 打印', 'export', 'primary', 'PDF') + btn('PNG 图片', 'export', 'secondary', 'PNG') + '</div><details class="bd-other-formats"><summary>其他导出格式</summary><p class="muted">可编辑乐谱保存到设备后，可重新导入继续编辑。</p><div class="row">' + btn('可编辑乐谱（.123）','export','text','可编辑乐谱（.123）') + ['MusicXML','MIDI','PPTX'].map(v => btn(v,'export','text',v)).join('') + '</div></details></section>';
}
function detailPanel() {
  const title = s.inspector;
  const body = title === "调式" ? compactConversion() : title === "导出" ? compactOutput() : title === "重命名" ?
      '<form id="rename-song" class="bd-compact"><label class="field">曲名<input id="song-name" value="' + esc(s.title) + '" maxlength="120" required></label><div class="row">' + btn("取消", "closePanel", "secondary") + btn("确定", "renameCommit", "primary") + '</div></form>' : title === "从库中删除？" ?
      '<section class="bd-compact"><p>将从曲谱库移除《' + esc(s.title) + '》。</p><div class="row">' + btn("取消", "closePanel", "secondary") + btn("删除", "deleteSong", "bd-danger") + '</div></section>' : title === "练习设置" ?
      '<section class="control-section"><p class="field-title">播放速度</p><div class="bd-options">' + ["0.5×", "0.75×", "1×", "1.25×"].map(v => btn(v, "detailSpeed", s.speed === v ? "selected" : "secondary", v)).join("") + '</div><p class="field-title">谱面字号</p><div class="bd-options">' + ["标准", "大字", "特大"].map(v => btn(v, "detailFont", s.font === v ? "selected" : "secondary", v)).join("") + '</div><label class="check"><input type="checkbox" data-field="lyrics" ' + (s.lyrics ? "checked" : "") + '>显示歌词</label></section>' :
      '<section class="bd-compact"><div class="bd-more-list">' + btn("重命名", "detailTool", "secondary", "重命名") + (s.library.includes(s.title) ? btn("从库中删除", "detailTool", "bd-danger", "从库中删除？") : '<p class="muted">保存入库后可管理这首曲谱。</p>') + '</div></section>';
  const footer = title === "调式" ? '<footer class="bd-panel-footer">' + btn("应用并预览", "apply", "primary full") + '</footer>' : '';
  return '<aside class="bd-panel" role="dialog" aria-modal="true" aria-label="' + title + '"><header class="bd-panel-head"><strong>' + title + '</strong>' + btn(glyph("close") + '<span class="sr-only">关闭弹窗</span>', "closePanel", "bd-icon") + '</header><div class="bd-panel-scroll">' + body + '</div>' + footer + '</aside>';
}
function logoPage() {
  return '<main class="logo-page"><div class="section-head"><h1>Nota 标识方案</h1>' + btn('返回页面','returnView','secondary') + '</div><p class="muted">L1 已调整为一线一间、相差半格，并将 N 下移居中；三版均保留细斜线。选择后可回到首页查看实际尺寸；尚未定稿。</p><div class="logo-grid">' + [1,2,3].map(v => '<section class="logo-concept ' + (logoVersion === v ? 'chosen' : '') + '"><div class="logo-hero">' + notaLogo(v,'concept-mark') + '</div><h2>' + logoNames[v] + '</h2><div class="logo-size-row">' + notaLogo(v) + '<strong>Nota</strong><span>24px</span>' + notaLogo(v,'logo-tiny') + '</div><p class="muted">' + ['薄荷五线谱，音符一线一间，N 下移居中。','圆章留白，两个音符形成更大的高低差。','深色底配浅绿音符，提高小尺寸对比。'][v-1] + '</p>' + btn(logoVersion === v ? '正在预览' : '预览这版', 'logoPick', logoVersion === v ? 'primary full' : 'secondary full', String(v)) + '</section>').join('') + '</div></main>';
}
function editorPage() {
  return '<main class="dolce-page"><header class="dolce-page-nav">' + btn('← 返回曲子详情','returnView','secondary') + '<span><strong>' + esc(s.title) + '</strong><small>Dolce 编辑器布局原型</small></span></header><iframe id="dolce-workspace-frame" title="Dolce 独立编辑页面" class="dolce-workspace-frame"></iframe><p class="muted">沿用 Dolce 原布局与响应式规则；源码、谱面及工具交互为占位演示，未连接真实编辑引擎。</p></main>';
}
function detailPlayer() {
  return '<footer class="bd-player" aria-label="练习播放控制"><div class="bd-progress"><span>' + (s.playing ? "0:08" : "0:00") + '</span><input type="range" min="0" max="33" value="' + (s.playing ? 8 : 0) + '" aria-label="播放进度（演示）" data-field="position"><span>0:33</span></div><div class="bd-transport">' +
    btn('<strong>' + s.speed + '</strong><small>速度</small>', "detailTool", "bd-speed", "练习设置") +
    btn(glyph("reset") + '<span class="sr-only">回到开头</span>', "detailReset", "bd-icon") +
    btn(glyph(s.playing ? "pause" : "play") + '<span class="sr-only">' + (s.playing ? "暂停" : "播放") + '</span>', "play", "bd-play") +
    btn(glyph("loop") + '<span class="sr-only">' + (s.looping ? "关闭循环" : "整首循环") + '</span>', "detailLoop", "bd-icon " + (s.looping ? "selected" : "")) +
    btn('<strong>字</strong><small>阅读</small>', "detailTool", "bd-speed", "练习设置") + '</div></footer>';
}
export function VariantB() {
  if (s.page === "library") return header(btn("返回曲谱", "back", "text")) + '<main class="b-library">' + library() + sourceChooser() + '</main>';
  if (!s.loaded) return header() + '<main class="b-library">' + sourceChooser() + library() + '</main>';
  const reading = s.space === "练习";
  return '<section data-song="' + esc(s.title) + '" class="bd-shell ' + (reading ? 'is-practice ' : 'is-edit ') + (s.panel ? 'has-panel has-modal ' : '') + 'bd-font-' + (s.font === "特大" ? 'xl' : s.font === "大字" ? 'lg' : 'md') + '" aria-label="曲子详情"><header class="bd-appbar">' +
    btn(glyph("back") + '<span class="sr-only">返回曲谱库</span>', "library", "bd-icon") +
    '<div class="bd-song"><h1>' + esc(s.title) + '</h1><small>' + (s.saved ? (reading ? '曲谱库 · 演示曲谱' : '已模拟保存到曲谱库') : '当前编辑稿 · 未保存') + '</small></div>' +
    '<div class="bd-doc-actions">' + (reading ? btn("导出", "detailTool", "bd-save", "导出") : btn("保存入库", "save", "bd-save")) + btn(glyph("more") + '<span class="sr-only">更多曲谱操作</span>', "detailTool", "bd-icon", "曲谱管理") + '</div>' + '</header>' +
    '<div class="bd-mode-row"><nav class="bd-mode" aria-label="曲子使用模式">' + btn("练习", "detailMode", reading ? "selected" : "", "练习") + btn("编辑", "detailMode", reading ? "" : "selected", "编辑") + '</nav><span class="bd-mode-hint">' + (reading ? '安心看谱，操作不会改动音符' : '调式、导出，以及 Dolce 原有编辑工具') + '</span></div>' +
    '<div class="bd-workspace"><main class="bd-score-scroll"><div class="bd-score-context"><span>' + (s.applied ? '练习谱 · 1=' + esc(s.target) : '原谱 · 1=E♭') + ' · 4/4</span>' + '<span>简谱 · 8 小节</span>' + '</div><div class="bd-paper">' + score(true) + '</div>' + (reading ? '<p class="bd-end">— 本页结束 —</p>' : '<p class="bd-edit-help">' + ('调式和导出快速处理，详细改谱进入独立编辑页') + '</p>') + '</main>' +
    (s.panel ? btn('<span class="sr-only">收起工具面板</span>', 'closePanel', 'bd-backdrop') + detailPanel() : '') + '</div>' +
    (reading ? detailPlayer() : '<nav class="bd-edit-dock" aria-label="编辑工具">' + detailTool('调式', 'tune', '调式') + detailTool('导出', 'share', '导出') + detailTool('编辑', 'edit', '编辑') + '</nav>') + '</section>';
}
export function VariantC() {
  const spaceNav = '<nav class="space-tabs">' + btn("制作", "space", s.space === "制作" ? "active" : "", "制作") + btn("练习", "space", s.space === "练习" ? "active" : "", "练习") + "</nav>";
  if (s.page === "reading") return header(spaceNav) + '<main class="practice-space">' + practice() + "</main>";
  return header(spaceNav) + '<main class="c-main">' + (s.space === "练习" ? '<div class="c-heading"><span class="eyebrow">练习空间</span><h1>把注意力留给音乐</h1><p class="muted">找出已准备好的谱，直接打开阅读和试听。</p></div>' + library(true) :
    '<div class="c-heading"><span class="eyebrow">制作空间</span><h1>把手边的谱，做成练习谱</h1><p class="muted">在这里处理原稿、校对和输出；练习时进入另一空间。</p></div><div class="c-layout"><aside class="c-library"><div class="section-head"><h3>制作中的曲谱</h3>' + btn("＋ 新制作", "new", "text") + '</div><button class="project active" data-act="open" data-val="小星星"><span class="score-icon">♫</span><strong>小星星</strong><small>' + (s.doubts ? "待校对 · " + s.doubts + " 处" : "可排版输出") + '</small></button><button class="project" data-act="open" data-val="莫斯科郊外的晚上"><span class="score-icon">♫</span><strong>莫斯科郊外的晚上</strong><small>可继续制作</small></button><details><summary>全部家庭曲谱</summary>' + titles.slice(2, 8).map(t => btn(esc(t), "open", "text full", t)).join("") + '</details></aside><section class="c-document">' + (!s.loaded ? sourceChooser() : '<div class="doc-row">' + docHead() + '</div><div class="c-task-layout"><nav class="task-menu">' + ["校对", "调整", "输出"].map((t, i) => '<button class="' + (s.inspector === t ? "active" : "") + '" data-act="inspector" data-val="' + t + '"><span>0' + (i + 1) + '</span><strong>' + ["核对原稿", "生成练习谱", "排版并导出"][i] + '</strong><small>' + [s.doubts + " 处待复核", "记谱基准与移调", "打印、分享、保存"][i] + '</small></button>').join("") + btn("更多编辑", "inspector", "text", "编辑") + '</nav><div class="c-task">' + (s.inspector === "校对" ? correction() : s.inspector === "调整" ? conversion() : s.inspector === "输出" ? output() : expert()) + '<details class="peek"><summary>查看当前谱面</summary>' + score() + '</details></div></div>') + '</section></div>') + '</main>';
}
function findPage() {
  const hit = /贝多芬|beeth|肖邦|chopin|摇篮曲/.test(s.query.toLowerCase());
  const found = /肖邦|chopin/.test(s.query.toLowerCase()) ? ["前奏曲 · 肖邦", "练习曲 · 肖邦"] : /贝多芬|beeth/.test(s.query.toLowerCase()) ? ["Bitten · 贝多芬", "Die Liebe des Nächsten · 贝多芬"] : ["摇篮曲 · 勃拉姆斯"];
  return header(btn("← 返回制作", "back", "text")) + '<main class="find-page"><span class="eyebrow">从已接入的曲库查找</span><h1>联网查谱</h1><p class="muted">来源：OpenScore 歌曲库。可用曲名、中文或外文作者名查找。</p><form id="find-form"><input id="find-query" type="search" aria-label="曲名或作者" placeholder="曲名或作者" value="' + esc(s.query) + '">' + btn("搜索", "search", "primary") + '</form>' +
    (!s.searched ? '<div class="empty"><span>⌕</span><h3>输入曲名或作者后开始搜索</h3><p>搜索结果将显示在这里。</p></div>' :
      '<div class="section-head"><h3>“' + esc(s.query) + '”的结果</h3><span class="muted">' + (hit ? found.length : 0) + ' 条演示结果 · OpenScore</span></div>' + (hit ? found.map(t => '<div class="result-row"><span><strong>' + t + '</strong><small>OpenScore · 数字乐谱</small></span>' + btn("查看详情 →", "candidate", "secondary", t) + "</div>").join("") : '<div class="empty"><h3>当前已接入库没有匹配结果</h3><p>可以换一个曲名或导入手边的谱。</p></div>')) +
    '<details><summary>从文件导入其他来源</summary><p class="muted">高级入口：导入由外部工具准备的 Nota 候选文件，核对来源后再打开。</p>' + btn("选择候选文件", "notice", "secondary", "此原型只演示入口位置，不读取或上传文件。") + "</details></main>";
}
function comparePage() {
  return header(btn("返回方案", "compare", "text")) + '<main class="compare-page"><span class="eyebrow">用户优先级：制谱打印 ＞ 手机陪练 ≫ 深度编辑</span><h1>三种结构，与 Dolce 原版对照</h1><p class="lead">问题不是缺少按钮，而是谁先看到什么、下一步去哪里。</p><div class="comparison-grid">' +
    [["Dolce 原版", "文件 → 编辑工作台 → 保存 / 导出", "面向改谱者；源码、谱面、试听和上下文工具共处一份文档。", "保留：原图对照、可视化编辑、声部与格式能力。Nota 的家庭曲库和两种转换需要额外的任务层。"],
    ["A · 引导式制谱", "带入 → 校对 → 调整 → 排版交付", "第一次做谱的家长；每一步只出现当前要做的决定。", "优势：路径明确。代价：熟练用户可能觉得步骤多；已有数字谱需要允许跳步。"],
    ["B · 谱面工作台", "一份文档 → 按需打开任务面板", "反复做谱、边看边调的人；谱面常驻，任务可以自由切换。", "优势：反馈直接，最接近 Dolce。代价：仍需理解校对、调整、输出的区别；手机需要面板切换。"],
    ["C · 双空间", "制作工作台 ⇄ 只读练习空间", "一个人负责做谱，家人拿手机陪练；同一份曲谱，两种使用界面。", "优势：制作和练习互不干扰。代价：多一层导航，制作内的任务切换比 A 更自由。"]].map((x, i) => '<section class="comparison"><span class="eyebrow">' + (i ? "方案 " + ["A", "B", "C"][i - 1] : "上游基线") + '</span><h2>' + x[0] + '</h2><p class="ia-path">' + x[1] + '</p><p>' + x[2] + '</p><p class="muted">' + x[3] + "</p>" + (i ? btn("体验此方案 →", "variant", "primary", ["A", "B", "C"][i - 1]) : '<a class="link" href="https://lodebar2026.github.io/dolce/" target="_blank" rel="noreferrer">打开 Dolce 原版 ↗</a>') + "</section>").join("") +
    '</div><section class="recommendation"><h2>本轮收敛方向：B 的曲子详情页 + 编辑 / 练习双态</h2><p>按你的反馈，将变化集中在单首曲子详情页内。谱库打开默认练习，练习在左、编辑在右。编辑态只保留调式、导出、编辑三个主要入口，编辑复用 Dolce 原有记号面板；练习态保留谱面、试听和阅读设置，手机端使用固定底栏。</p><p class="muted">用户倾向 B 的大方向；本轮布局仍待走查，不实施到正式页面。A / C 保留供比较。</p></section><details><summary>比较证据与边界</summary><p>已实际打开 Dolce 在线首页及示例编辑器；固定基线为 Nota 所采用的 Dolce 0.8.3 / 2aab8ef。在线页面可能随上游更新。</p><p><a href="https://github.com/lodebar2026/dolce/blob/2aab8ef2333ba9e1a2a7b342080381fcacdd41ac/index.html" target="_blank" rel="noreferrer">固定版本界面结构</a> · <a href="https://github.com/ren2019/nota/blob/main/app/UPSTREAM.md" target="_blank" rel="noreferrer">Nota 底座记录</a></p><p>原型均使用内存演示数据；不是 Dolce 的像素复刻，也不承诺改变识谱准确率或格式能力。</p></details></main>';
}
function stateView() {
  return '<details class="state-view"><summary>原型状态 · ' + variant + ' / ' + ({ new: "首次制谱", review: "继续校对", practice: "手机陪练" }[scene]) + ' / ' + (s.saved ? "已模拟保存" : "未保存") + '</summary><pre>' + esc(JSON.stringify({ variant, scene, viewport: phone ? phoneWidth + "px preview" : "responsive", ...s }, null, 2)) + "</pre></details>";
}
function render() {
  const oldSong = root?.querySelector<HTMLElement>(".bd-shell")?.dataset.song;
  const oldScroll = oldSong === s.title ? root?.querySelector<HTMLElement>(".bd-score-scroll")?.scrollTop || 0 : 0;
  document.body.classList.toggle("detail-prototype", variant === "B" && s.loaded && s.page === "work" && !compare);
  const app = compare ? comparePage() : s.page === "logos" ? logoPage() : s.page === "dolce" ? editorPage() : s.page === "find" ? findPage() : s.page === "candidate" ? header(btn("← 返回搜索", "backSearch", "text")) + '<main class="find-page"><span class="eyebrow">候选详情 · 演示</span><h1>' + esc(s.note) + '</h1><p>来源：OpenScore · 许可和声部在此确认</p><p class="muted">选择结果后再获取原谱、核对声部与数据。这里不把默认第一个声部当作检查结论。</p>' + btn("打开到制作空间", "adopt", "primary") + "</main>" : variant === "A" ? VariantA() : variant === "B" ? VariantB() : VariantC();
  root.innerHTML = '<div class="lab"><strong>IA 原型 · 非正式页面</strong><span>仅交互演示，不执行识别、音频播放、转换、下载或入库</span><div>' + btn(phone ? "宽屏" : "窄屏", "phone") + (phone ? '<label class="device-size"><span class="sr-only">预览宽度</span><select id="device-width" aria-label="预览宽度">' + [360,390,430].map(w => '<option value="' + w + '" ' + (phoneWidth === w ? 'selected' : '') + '>' + w + '</option>').join('') + '</select></label>' : '') + btn("Logo", "logos") + btn("对照", "compare") + '</div></div><div class="scene-bar"><span>体验场景</span>' +
    [["new", "首次制谱"], ["review", variant === "B" ? "编辑态" : "继续校对"], ["practice", variant === "B" ? "练习态" : "手机陪练"]].map(x => btn(x[1], "scene", scene === x[0] ? "active" : "", x[0])).join("") + '</div><div id="ia-device" class="' + (phone ? "phone" : "") + '"' + (phone ? ' style="max-width:' + (phoneWidth + 24) + 'px"' : '') + '><div id="ia-app" class="variant-' + variant + '"><div class="screen">' + app + '</div></div></div>' +
    (s.notice ? '<div class="notice" role="status">' + esc(s.notice) + btn("×", "dismiss", "text") + "</div>" : "") + stateView() +
    '<nav class="prototype-switcher" aria-label="切换 IA 方案">' + btn("←", "prevVariant", "", "") + '<div><small>切换结构 · ← →</small><strong>' + variant + " · " + names[variant] + '</strong></div>' + btn("→", "nextVariant") + '<select id="variant-select" aria-label="选择方案">' + (["A", "B", "C"] as Variant[]).map(v => '<option value="' + v + '" ' + (v === variant ? "selected" : "") + '>' + v + "</option>").join("") + "</select></nav>";
  const editorFrame = root.querySelector<HTMLIFrameElement>("#dolce-workspace-frame");
  if (editorFrame) mountDolceWorkspace(editorFrame, s.title);
  const nextScroll = root.querySelector<HTMLElement>(".bd-score-scroll");
  if (nextScroll) nextScroll.scrollTop = oldScroll;
  console.info("[THROWAWAY IA PROTOTYPE]", { variant, scene, ...s });
}
function snapshot() { return { s: { ...s, library: [...s.library] }, variant, scene, phone, phoneWidth, logoVersion }; }
function viewURL() {
  const u = new URL(location.href);
  if (s.page === "dolce" || s.page === "logos") u.searchParams.set("view", s.page === "dolce" ? "editor" : "logos");
  else u.searchParams.delete("view");
  return u;
}
function navigateView(page: string) {
  if (s.page === page) return;
  s.panel = false; s.playing = false;
  history.replaceState({ ...history.state, ia: snapshot() }, "", location.href);
  s.page = page;
  history.pushState({ ia: snapshot(), viaPrototype: true }, "", viewURL()); render();
}
function url() {
  const u = viewURL(); u.searchParams.set("variant", variant);
  u.searchParams.set("scene", scene); u.searchParams.set("phone", phone ? "1" : "0"); u.searchParams.set("width", String(phoneWidth));
  u.searchParams.set("logo", String(logoVersion));
  history.replaceState({ ...history.state, ia: snapshot() }, "", u); render();
}
function changeVariant(v: string) {
  variant = (["A", "B", "C"].includes(v) ? v : "A") as Variant;
  compare = false; s.page = scene === "practice" && variant === "C" ? "reading" : "work";
  s.inspector = steps[s.step] === "排版与交付" ? "输出" : s.step === 2 ? "调整" : "校对";
  url();
}
function action(act: string, val: string) {
  s.notice = "";
  if (act === "logos") return navigateView("logos");
  if (act === "logoPick") { logoVersion = Number(val); return url(); }
  if (act === "returnView") { if (history.state?.viaPrototype) history.back(); else { s.page = "work"; url(); } return; }
  if (act === "variant") return changeVariant(val);
  if (act === "nextVariant" || act === "prevVariant") return changeVariant(["A", "B", "C"][(["A", "B", "C"].indexOf(variant) + (act === "nextVariant" ? 1 : 2)) % 3]);
  if (act === "scene") {
    scene = val as Scene; s = fresh();
    if (scene === "new") { s.loaded = false; s.step = 0; }
    if (scene === "practice") { if (variant === "B") s.saved = true; s.space = "练习"; s.page = variant === "C" ? "reading" : "work"; }
    compare = false; return url();
  }
  if (act === "phone") { phone = !phone; return url(); }
  if (act === "compare") compare = !compare;
  if (act === "demo" || act === "source") { s = fresh(); s.source = val || "示例图片"; scene = "review"; s.notice = "已载入演示曲谱；未读取、上传任何真实文件。"; }
  if (act === "new") { s.loaded = false; s.step = 0; }
  if (act === "step") { s.step = Number(val); s.inspector = ["校对", "校对", "调整", "输出"][s.step]; if (s.step > 0) s.loaded = true; }
  if (act === "next" || act === "prev") s.step = Math.max(0, Math.min(3, s.step + (act === "next" ? 1 : -1)));
  if (act === "resolve") { s.doubts = Math.max(0, s.doubts - 1); s.selected = 1; s.notice = s.doubts ? "已模拟确认一处，下一处已定位。" : "两处演示问题已确认，可以继续。"; }
  if (act === "locate") { s.original = true; s.selected = 1 - s.selected; s.notice = "已演示定位到原图和谱面的对应位置。"; }
  if (act === "later") { s.step = 2; s.panel = true; s.inspector = variant === "B" ? "调式" : "调整"; s.notice = s.doubts ? "保留待复核标记，继续调整；不会假装校对通过。" : "校对已确认，继续调整练习谱。"; }
  if (act === "inspector") { s.inspector = val; s.panel = true; }
  if (act === "closePanel") s.panel = false;
  if (act === "detailMode") { s.space = val === "练习" ? "练习" : "制作"; scene = val === "练习" ? "practice" : "review"; s.panel = false; s.playing = false; }
  if (act === "detailTool" && val === "编辑") return navigateView("dolce");
  if (act === "detailTool") { s.panel = !(s.panel && s.inspector === val); s.inspector = val; }
  if (act === "detailSpeed") s.speed = val;
  if (act === "detailFont") s.font = val;
  if (act === "detailReset") { s.playing = false; s.notice = "已演示回到开头；没有实际音频。"; }
  if (act === "detailLoop") { s.looping = !s.looping; s.notice = s.looping ? "已开启整首循环演示。" : "已关闭循环演示。"; }
  if (act === "original") s.original = !s.original;
  if (act === "dolceOriginal") s.dolceOriginal = !s.dolceOriginal;
  if (act === "code") s.sourceCode = !s.sourceCode;
  if (act === "apply") { s.applied = true; s.saved = false; s.notice = "仅演示应用后的界面状态，未执行真实音乐转换。"; }
  if (act === "undo") s.applied = false;
  if (act === "save") {
    s.saved = true;
    if (variant === "B") {
      if (!s.library.includes(s.title)) s.library.unshift(s.title);
      s.space = "练习"; scene = "practice"; s.panel = false; s.playing = false;
    }
    s.notice = "已模拟保存入库，切回练习；未写入正式服务。";
  }
  if (act === "renameCommit") {
    const name = (root.querySelector<HTMLInputElement>("#song-name")?.value || "").trim();
    if (!name) { s.notice = "请输入曲名。"; return render(); }
    const index = s.library.indexOf(s.title);
    if (name !== s.title && s.library.includes(name)) { s.notice = "曲谱库中已有同名曲谱，请换一个名字。"; return render(); }
    if (index !== -1) s.library[index] = name;
    s.title = name; s.panel = false; s.notice = "已模拟重命名；未写入正式服务。";
  }
  if (act === "deleteSong") {
    s.library = s.library.filter(name => name !== s.title);
    s.page = "library"; s.panel = false; s.playing = false; s.saved = false;
    s.notice = "已从演示曲谱库移除，刷新可恢复；未删除正式曲谱。";
  }
  if (act === "export") { s.output = val; s.notice = "已演示交付 " + val + " 的入口；原型不生成或下载文件。"; }
  if (act === "play") { s.playing = !s.playing; s.notice = "仅演示试听状态，没有实际音频。"; }
  if (act === "loop") s.notice = "循环入口演示：选段后循环选段，未选则循环整首。";
  if (act === "space") { s.space = val; s.page = "work"; scene = val === "练习" ? "practice" : "review"; }
  if (act === "practice") { s.title = val || s.title; s.space = "练习"; scene = "practice"; s.page = variant === "C" ? "reading" : "work"; }
  if (act === "edit") { s.panel = false; scene = "review"; s.space = "制作"; s.page = "work"; s.step = 1; s.inspector = "校对"; }
  if (act === "open") { scene = variant === "B" ? "practice" : "review"; s.panel = false; s.title = val; s.loaded = true; s.page = "work"; s.step = 1; s.inspector = variant === "B" ? "编辑" : "校对"; s.space = variant === "B" ? "练习" : "制作"; if (variant === "B") s.saved = true; }
  if (act === "library") { s.page = "library"; s.panel = false; s.playing = false; }
  if (act === "find") { s.page = "find"; s.query = ""; s.searched = false; }
  if (act === "backSearch") s.page = "find";
  if (act === "search") { s.query = (root.querySelector("#find-query") as HTMLInputElement)?.value.trim() || ""; s.searched = !!s.query; }
  if (act === "candidate") { s.note = val; s.page = "candidate"; }
  if (act === "adopt") { s.title = s.note; s.loaded = true; s.page = "work"; s.source = "OpenScore（演示）"; s.doubts = 2; s.step = 1; s.inspector = "校对"; s.space = "制作"; scene = "review"; }
  if (act === "back") {
    if (variant === "B" || (variant === "C" && s.page === "reading")) s.page = "work";
    else { s.page = "work"; if (s.space === "练习") { s.space = "制作"; scene = "review"; } }
  }
  if (act === "notice") s.notice = val;
  url();
}
export function mountIAPrototype(defaultVariant: Variant = "A") {
  const p = new URLSearchParams(location.search);
  variant = (["A", "B", "C"].includes(p.get("variant") || "") ? p.get("variant") : defaultVariant) as Variant;
  scene = (["new", "review", "practice"].includes(p.get("scene") || "") ? p.get("scene") : variant === "B" ? "practice" : "review") as Scene;
  phone = p.get("phone") === "1"; phoneWidth = [360,390,430].includes(Number(p.get("width"))) ? Number(p.get("width")) : 390; s = fresh();
  if (scene === "new") { s.loaded = false; s.step = 0; }
  if (scene === "practice") { if (variant === "B") s.saved = true; s.space = "练习"; s.page = variant === "C" ? "reading" : "work"; }
  if ([1,2,3].includes(Number(p.get("logo")))) logoVersion = Number(p.get("logo"));
  if (p.get("view") === "editor") s.page = "dolce";
  if (p.get("view") === "logos") s.page = "logos";
  document.title = "Nota IA 原型 · A / B / C";
  document.body.className = "ia-prototype"; document.body.innerHTML = '<div id="ia-prototype"></div>';
  root = document.getElementById("ia-prototype")!;
  root.addEventListener("click", e => {
    const b = (e.target as Element).closest<HTMLElement>("[data-act]");
    if (!b) return; e.preventDefault(); action(b.dataset.act!, b.dataset.val || "");
  });
  root.addEventListener("change", e => {
    const f = e.target as HTMLInputElement;
    if (f.id === "variant-select") return changeVariant(f.value);
    if (f.id === "device-width") { phoneWidth = Number(f.value); return url(); }
    const field = f.dataset.field; if (!field) return;
    if (field === "lyrics") s.lyrics = f.checked;
    else if (field === "mode") s.mode = f.value;
    else if (field === "target") s.target = f.value;
    else if (field === "font") s.font = f.value;
    else if (field === "paper") s.paper = f.value;
    else { s.notice = "仅演示此设置的位置。"; }
    render();
  });
  root.addEventListener("submit", e => { e.preventDefault(); action((e.target as HTMLFormElement).id === "rename-song" ? "renameCommit" : "search", ""); });
  window.addEventListener("popstate", e => {
    const keepLogo = logoVersion;
    if (e.state?.ia) { const snap = e.state.ia; s = snap.s; variant = snap.variant; scene = snap.scene; phone = snap.phone; phoneWidth = snap.phoneWidth; logoVersion = snap.logoVersion; }
    else s.page = "work";
    logoVersion = keepLogo; url();
  });
  window.addEventListener("keydown", e => {
    if (e.key === "Escape" && s.panel) { e.preventDefault(); action("closePanel", ""); return; }
    if ((e.target as Element)?.closest("input,textarea,select,[contenteditable]")) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault(); action(e.key === "ArrowLeft" ? "prevVariant" : "nextVariant", "");
    }
  });
  render();
}
