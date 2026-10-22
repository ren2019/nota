import "./styles.css";
import "./nota/home.css";
import { prepareRecognitionFiles } from "./nota/recognition-input";
import { MetaData } from "./smufl/smufl";
import { ensureFontsReady } from "./common/measure";
import { asset } from "./common/asset";
import { App, type ViewMode } from "./editor/app";
import { IMAGE_EXT, IMAGE_ACCEPT, isDocFile, isImageFile } from "./common/filetypes";
import { showOptionsDialog, showHanConvDialog, openFilePicker, openModal } from "./editor/dialogs";
import { showPartsPanel } from "./editor/parts";
import { showExportDialog, showSaveAsDialog } from "./editor/export";
import { showHelpDialog } from "./editor/help";
import { isTauriRuntime } from "./editor/fileio";
import { maybeAutoCheck } from "./editor/update";
import { PaintResources, ScorePainter, staffOptionsOf } from "./layout/painter";
import type { MixedOptions } from "./mixed/model";
import { initLang, onLangChange, t } from "./i18n";
import { setupPopover } from "./editor/toolpop";
import { setupCompareSelect } from "./editor/comparemode";
import { mountPracticePanel } from "./nota/panel";
import { PRACTICE_SAMPLE } from "./nota/sample";
import { mountLibrary } from "./nota/library";
import { mountSourceImport } from "./nota/source-import";
import { mountLibraryManagement } from "./nota/library-management";
import { mountTuning } from "./nota/tuning-dialog";
import { mountPracticeControls } from "./nota/practice-controls";
import { CurrentDocumentSession } from "./nota/document-session";
import { mountEditorPage } from "./nota/editor-page";
import { mountDocumentDetail, type DetailMode, type DocumentDetail } from "./nota/detail";
import { mountNotaExport } from "./nota/export-dialog";

// 注册 Bravura 与 Bravura Text @font-face（替代 styles.css 里的静态声明），按 Vite base
// 解析字体 URL。和弦内的 csym 字形必须走真实 Text 变体，不能用普通 Bravura 等比模拟。
// Text 变体用的是只含 6 个 csym 字形的子集 NotaChordSymbols.otf（2.6 KB）。**别换回完整的那份**：
// 从前随仓库带的 BravuraText.woff2 浏览器根本加载不了（OTS：cmap 末段不是 0xFFFF-0xFFFF，
// Chromium/Edge 一律拒绝，`FontFace.load()` 抛 SyntaxError，boot 一路失败），
// 何况整份 500 KB 只为这 6 个字形也不值得。子集的 advance/bbox 与原字体逐字形相同。
async function registerBravura() {
  if (typeof FontFace === "undefined") return;
  const faces = [
    new FontFace("Bravura", `url(${asset("redist/Bravura.woff2")}) format("woff2")`),
    new FontFace("Nota Chord Symbols", `url(${asset("redist/NotaChordSymbols.otf")}) format("opentype")`),
  ];
  await Promise.all(faces.map((face) => face.load()));
  for (const face of faces) (document.fonts as FontFaceSet).add(face);
}

async function boot() {
  // 界面语言最先定：之后建的对话框、状态栏文字都按它走。
  initLang();
  await registerBravura();
  await ensureFontsReady([
    { family: "Bravura", size: 40 },
    { family: "Nota Chord Symbols", size: 20 },
    { family: "PingFang SC", size: 28 },
  ]);
  const meta = await MetaData.shared();

  const codePane = document.getElementById("code-pane")!;
  const scorePane = document.getElementById("score-pane")!;
  const appRoot = document.getElementById("app")!;
  const workspace = document.getElementById("body")!;
  const startFeedback = document.getElementById("start-feedback")!;
  const recognitionProgress = document.getElementById("recognition-progress")!;

  const app = new App(meta, scorePane);
  app.loadSettings();
  app.visual.attach({
    mode: document.getElementById("visual-mode"),
    selInfo: document.getElementById("sel-info"),
    marksBtn: document.getElementById("btn-format-marks") as HTMLButtonElement | null,
    beatBtn: document.getElementById("btn-beat-check") as HTMLButtonElement | null,
    beatCount: document.getElementById("beat-count"),
    palette: document.getElementById("visual-palette"),
    paletteBtn: document.getElementById("btn-palette") as HTMLButtonElement | null,
  });
  app.docFormat = "123";
  app.mountEditor(codePane, PRACTICE_SAMPLE);
  const win = window as unknown as { __app: App; __paint: ReturnType<typeof paintProbe>; __mixedModel: unknown; __omr: unknown; __raster: unknown; __project: unknown; __xmlout: unknown; __pu: unknown; __book: unknown;
    __j123: unknown; __pptx: unknown; __songbook: unknown };
  win.__app = app;
  // 统一排版器暴露（`new __paint.ScorePainter(__paint.resources)` + 请求），供混排 / 原样文档的无头回归脚本用。
  win.__paint = paintProbe(meta);
  // 混排模型（`AccidentalStat` / `GlyphCodes`）暴露，供 scripts/jianpu-semantic-check.mjs 三方比简谱语义。
  win.__mixedModel = Promise.all([import("./mixed/model"), import("./smufl/smufl"), import("./mixed/layout"), import("./mixed/staffpages")])
    .then(([model, smufl, layout, pages]) => ({ ...model, GlyphCodes: smufl.GlyphCodes, MetaData: smufl.MetaData, ...layout, formatMixedScore: pages.formatMixedScore }));
  // OMR 原语暴露（便于脚本化测试/准确率回归，同 __app 约定）。
  win.__omr = import("./omr");
  // 位图五线谱的浏览器侧入口（在线 OCR）：回归脚本 `staff-measure-all.mjs --live` 拿它与离线缓存那条路比读数
  win.__raster = import("./rasteromr/browser");
  // 识别项目打包 / 自动保存草稿：`omr-project-check.mjs` 拿字节做存—开往返
  win.__project = Promise.all([import("./editor/omrproject"), import("./editor/autosave")]).then(([p, a]) => ({ ...p, ...a }));
  // 文本谱（番茄 / 有谱）解析与排版暴露，供 pu-*.mjs 回归。
  win.__pu = import("./pu");
  // PPTX 导出（序列化器 + 展开档另排一遍那个 painter）暴露，供 scripts/pptx-export.mjs 批量转出用。
  win.__pptx = Promise.all([import("./editor/pptx"), import("./editor/export")])
    .then(([pptx, exp]) => ({ ...pptx, pptxPainter: exp.pptxPainter }));
  // 成书重排（BookStyle 注入 + 页面树 → DrawList）暴露，供 scripts/rebuild.mjs 用。
  win.__book = Promise.all([
    import("./pdflayout/browser"), import("./style/book"), import("./layout/painter"),
    import("./score/phrase"), import("./score/applybreaks"), import("./jpword/jpwfile"),
    import("./jpword/parse"), import("./model/jianpuinput"), import("./pu"),
    import("./model/fromxml"), import("./model/phrasedoc"), import("./score/timeline"), import("./model/playdoc"),
    import("./score/midi"), import("./layout/input"),
  ]).then(([book, bookStyle, painter, phrase, applybreaks, jpwfile, parse, jianpuinput, pu, fromxml, phrasedoc, timeline, playdoc, midi, input]) => ({
    ...book, ...bookStyle, ...painter, ...phrase, ...applybreaks, ...jpwfile, ...parse, ...jianpuinput, pu,
    ...fromxml, ...phrasedoc, ...timeline, ...playdoc, ...midi, ...input,
  }));
  // 混排歌本（清单 + .ss → DrawPage[]）暴露，供 scripts/kl2020-book.mjs 用。
  win.__songbook = Promise.all([import("./pdflayout/songbook"), import("./style/ss")])
    .then(([songbook, ss]) => ({ ...songbook, ...ss }));
  // 123 格式与语义模型暴露，供 scripts/j123-migrate.mjs 跑 MusicXML 那一路——
  // `loadScoreDoc` 要 DOMParser，Node 侧没有，所以这条必须在浏览器里走（同 __book 的路子）。
  win.__j123 = Promise.all([
    import("./j123/parse"), import("./j123/emit"),
    import("./model/fromjpw"), import("./model/frompu"), import("./model/helpers"),
    import("./model/jianpuinput"), import("./pu"),
    import("./abcfamily/emitabc.entry"),
    import("./model/fromxml"), import("./model/toxml"), import("./model/capability"),
    import("./model/jianpuproject"), import("./model/jianpu"), import("./model/tojpw"), import("./model/xmlproject"),
    import("./model/breaks"),
  ]).then((
    [parse, emit, fromjpw, frompu, helpers, jianpuinput, pu, emitabc,
     fromxml, toxml, capability, jianpuproject, jianpu, tojpw, xmlproject, breaks],
  ) => ({
    ...parse, ...emit, ...fromjpw, ...frompu, ...helpers, ...jianpuinput, pu,
    ...emitabc, ...fromxml, ...toxml, ...capability, ...jianpuproject, ...jianpu, ...tojpw, ...xmlproject, ...breaks,
  }));
  // `.jpwabc` ↔ MusicXML 的读入与导出版面（`engraveScoreDoc`：五线谱引擎排出导出版面，交给写出端）暴露，供 scripts/xml-roundtrip.mjs 回归
  // （写出端只有 `model/toxml.ts`，在 `__j123` 里）。
  win.__xmlout = Promise.all([
    import("./mixed/engrave"), import("./model/jianpuinput"), import("./model/fromxml"),
    import("./model/fromjpw"), import("./jpword/jpwfile"), import("./jpword/parse"),
  ]).then(([layout, jianpuinput, fromxml, fromjpw, jpwfile, parse]) =>
    ({ ...layout, ...jianpuinput, ...fromxml, ...fromjpw, ...jpwfile, ...parse }));

  const session = new CurrentDocumentSession(app);
  let detail: DocumentDetail;
  const revealWorkspace = (mode: DetailMode = "edit") => detail.open(mode);
  const library = mountLibrary(app, revealWorkspace, session, () => { if(detail.screen !== "library") detail.showDetail("practice"); });
  detail = mountDocumentDetail(app, session, () => { void library.refresh(); });
  mountSourceImport(library.adoptCandidate, detail);
  mountNotaExport(app);
  mountEditorPage(app, session, detail);
  mountTuning(app, session, detail);
  mountLibraryManagement(app, session, detail, library);
  // Extensions receive the same App/session/shell; no second document is created.
  app.saveToLibrary = async () => { await library.save(); };
  app.libraryDirty = () => session.dirty;
  app.beforeReplace = library.confirmReplace;
  app.draftContext = () => session.draftContext();
  app.documentStateChanged = () => session.notify();
  const showStartScreen = () => detail.home();
  const openStarter = async (text: string, name: string) => {
    if (!(await app.confirmReplace())) return;
    // Adopt only after the real parser/editor transaction succeeds.
    if(!(await app.openBytes(new TextEncoder().encode(text),name))) {setStartFeedback(app.status);return;}
    library.detach();
    await app.setViewMode("original");
    app.filePath = null;
    app.markClean();
    revealWorkspace();
  };
  const showSample = () => openStarter(PRACTICE_SAMPLE, "小星星.123");
  const showBlank = () => openStarter("T:未命名曲谱\nM:4/4\nQ:1/4=88\nK:1=C\n0 0 0 0 |]\n", "新曲谱.123");
  const setRecognitionBusy = (busy: boolean) => { recognitionProgress.hidden = !busy; };
  const setStartFeedback = (message:string,retryImages=false) => {
    startFeedback.textContent=message;startFeedback.hidden=!message;
    if(message && retryImages) {
      const retry=document.createElement('button');retry.type='button';retry.className='start-feedback-retry';retry.textContent=t('nota.ia.chooseImagesAgain');
      retry.onclick=() => recognizeFromPicker();startFeedback.append(' ',retry);
    }
  };
  const showRecognitionFailure = () => {
    const message=app.status || t('start.recognizeFailed');
    if(detail.screen === 'library') {setStartFeedback(message,true);return;}
    // Dragging an image can start from detail, where the professional status bar
    // is hidden. Keep the failure and its retry reachable on the current screen.
    const body=document.createElement('p');body.textContent=message;body.setAttribute('role','alert');
    const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent=t('nota.ia.close');
    const retry=document.createElement('button');retry.type='button';retry.textContent=t('nota.ia.chooseImagesAgain');
    const {close}=openModal({title:t('start.recognizeFailed'),body:[body],footer:[dismiss,retry]});
    dismiss.onclick=close;retry.onclick=() => {close();recognizeFromPicker();};
  };
  const mobileCodeBtn = document.getElementById("btn-mobile-code") as HTMLButtonElement;
  const mobileScoreBtn = document.getElementById("btn-mobile-score") as HTMLButtonElement;
  const setMobileView = (view: "code" | "score") => {
    const showCode = view === "code";
    workspace.classList.toggle("mobile-code", showCode);
    mobileCodeBtn.classList.toggle("active", showCode);
    mobileScoreBtn.classList.toggle("active", !showCode);
    mobileCodeBtn.setAttribute("aria-pressed", String(showCode));
    mobileScoreBtn.setAttribute("aria-pressed", String(!showCode));
  };
  const recognizeFromPicker = () => void pickRecognitionFile(app, {
    onPicked: () => { setStartFeedback(""); setRecognitionBusy(true); },
    onDone: (success) => {
      setRecognitionBusy(false);
      if (success) {
        library.detach();
        setMobileView("score");
        revealWorkspace();
      } else showRecognitionFailure();
    },
  });

  // toolbar
  const on = (id: string, fn: () => void) =>
    document.getElementById(id)?.addEventListener("click", fn);
  mountPracticePanel(app);
  on("btn-save", () => void app.saveFile());
  on("btn-saveas", () => showSaveAsDialog(app));
  on("btn-prev", () => app.prevPage());
  on("btn-next", () => app.nextPage());
  on("btn-options", () => showOptionsDialog(app));
  on("btn-parts", () => showPartsPanel(app));
  const hanziBtn = document.getElementById("btn-hanzi") as HTMLButtonElement | null;
  if (hanziBtn) {
    app.setHanziButton(hanziBtn);
    hanziBtn.addEventListener("click", () => showHanConvDialog(app));
  }
  on("btn-export", () => showExportDialog(app));
  on("btn-help", () => showHelpDialog(app));
  // 顶栏的应用级四项在手机宽度收进「⋯」（电脑上那个钮不显示，四项照常排在顶栏）
  const headerMore = document.getElementById("btn-header-more") as HTMLButtonElement | null;
  const headerTools = document.getElementById("header-tools");
  if (headerMore && headerTools) setupPopover(headerMore, headerTools);
  // 排版模式（展开 / 原样 / 五线谱 / 混排）。四档 = 「哪个排版器」×「哪一档版面」的组合，
  // 配法由 App.setViewMode 说了算，这里只负责接线。
  const viewSwitch = document.getElementById("view-mode-switch");
  const viewBtns = new Map<ViewMode, HTMLButtonElement>();
  for (const [mode, id] of [
    ["expanded", "btn-view-expanded"], ["original", "btn-view-original"],
    ["staff", "btn-view-staff"], ["mixed", "btn-view-mixed"],
  ] as const) {
    const btn = document.getElementById(id) as HTMLButtonElement | null;
    if (btn) {
      viewBtns.set(mode, btn);
      btn.addEventListener("click", () => void app.setViewMode(mode));
    }
  }
  if (viewSwitch) app.setViewModeButtons(viewSwitch, viewBtns);
  const recognizeBtn = document.getElementById("btn-recognize") as HTMLButtonElement | null;
  if (recognizeBtn) {
    app.omr.setRecognizeBtn(recognizeBtn);
    recognizeBtn.addEventListener("click", () => void app.omr.toggle());
  }
  app.omr.setKindSelects(
    document.getElementById("sel-recog-kind-start") as HTMLSelectElement | null,
    document.getElementById("sel-recog-kind") as HTMLSelectElement | null,
  );
  const adjustChk = document.getElementById("chk-adjust-first") as HTMLInputElement | null;
  if (adjustChk) {
    adjustChk.checked = app.omr.adjustFirst;
    adjustChk.addEventListener("change", () => {
      app.omr.adjustFirst = adjustChk.checked;
      app.saveSettings();
    });
  }
  const doubtBtn = document.getElementById("btn-doubt") as HTMLButtonElement | null;
  if (doubtBtn) app.omr.setDoubtEl(doubtBtn);
  const pagesBtn = document.getElementById("btn-src-pages") as HTMLButtonElement | null;
  if (pagesBtn) app.omr.setPagesBtn(pagesBtn);
  const codeChk = document.getElementById("chk-code") as HTMLInputElement | null;
  if (codeChk) app.omr.setCodeCheckbox(codeChk);
  const sideBtn = document.getElementById("btn-src-side") as HTMLButtonElement | null;
  if (sideBtn) app.omr.setSideBtn(sideBtn, document.getElementById("omr-side"));
  const followBtn = document.getElementById("btn-src-follow") as HTMLButtonElement | null;
  if (followBtn) app.omr.setFollowBtn(followBtn, document.getElementById("omr-follow"));
  const recogViewSel = document.getElementById("sel-recog-view") as HTMLSelectElement | null;
  if (recogViewSel) {
    app.omr.setRecogViewSelect(recogViewSel);
    recogViewSel.addEventListener("change", () => app.omr.setRecogView(recogViewSel.value as import("./omr").RecogView));
  }
  // 状态栏「对照」下拉：驱动上面几个控件（它们藏在 .compare-legacy 里，显隐仍表示能不能用）
  {
    const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
    const select = byId<HTMLSelectElement>("sel-compare");
    const field = byId<HTMLElement>("compare-field");
    const recognize = byId<HTMLButtonElement>("btn-recognize");
    const side = byId<HTMLButtonElement>("btn-src-side");
    const follow = byId<HTMLButtonElement>("btn-src-follow");
    if (select && field && recognize && side && follow && recogViewSel) {
      const compare = setupCompareSelect({
        select, field, recognize, side, follow, view: recogViewSel,
        // 用户选过的核对方式：以后识别完照它进
        onUserChange: (v) => app.omr.setComparePreference(v),
      });
      app.omr.applyCompare = (v) => compare.apply(v);
    }
  }
  const docFormatSel = document.getElementById("sel-doc-format") as HTMLSelectElement | null;
  if (docFormatSel) app.formats.bind(docFormatSel); // 选项由来源（识别结果 / 打开的文件）给，见 editor/formatswitch.ts
  const originalLayoutBtn = document.getElementById("btn-layout-original") as HTMLButtonElement | null;
  const phraseBtn = document.getElementById("btn-phrase") as HTMLButtonElement | null;
  if (originalLayoutBtn && phraseBtn) {
    app.setPhraseButtons(originalLayoutBtn, phraseBtn);
    originalLayoutBtn.addEventListener("click", () => app.setPhraseLayout(false));
    phraseBtn.addEventListener("click", () => app.setPhraseLayout(true));
  }
  const playBtn = document.getElementById("btn-play") as HTMLButtonElement | null;
  if (playBtn) {
    app.playback.setPlaybackBtn(playBtn);
    playBtn.addEventListener("click", () => void app.playback.toggle());
  }
  const stopBtn = document.getElementById("btn-stop") as HTMLButtonElement | null;
  if (stopBtn) app.playback.setStopBtn(stopBtn);
  const progress = document.getElementById("play-progress") as HTMLInputElement | null;
  if (progress) app.playback.bindProgress(progress, document.getElementById("play-time"));
  const speedSel = document.getElementById("sel-speed") as HTMLSelectElement | null;
  if (speedSel) app.playback.bindSpeedSelect(speedSel);
  app.playback.bindToggles(document.getElementById("btn-loop") as HTMLButtonElement | null, document.getElementById("btn-metronome") as HTMLButtonElement | null);
  mountPracticeControls(app, session, detail);
  const openScore = async () => { const statusBefore=app.status; if (await app.openFile()) { library.detach(); setStartFeedback(""); revealWorkspace(); } else if(appRoot.classList.contains("is-starting") && app.status !== statusBefore) setStartFeedback(app.status); };
  document.getElementById("btn-open")?.addEventListener("click", () => void openScore());
  document.getElementById("btn-start-score")?.addEventListener("click", () => void openScore());
  document.getElementById("btn-image-open")?.addEventListener("click", recognizeFromPicker);
  document.getElementById("btn-start-image")?.addEventListener("click", recognizeFromPicker);
  document.getElementById("btn-start-sample")?.addEventListener("click", () => void showSample());
  document.getElementById("btn-start-new")?.addEventListener("click", () => void showBlank());
  document.getElementById("btn-home")?.addEventListener("click", showStartScreen);
  mobileCodeBtn.addEventListener("click", () => setMobileView("code"));
  mobileScoreBtn.addEventListener("click", () => setMobileView("score"));

  const updateZoom = wireZoomControls(app, scorePane, on);
  // 切换界面语言：已开的对话框关掉（下次打开按新语言建），代码写的控件文字重出
  onLangChange(() => {
    document.querySelectorAll(".modal-overlay, .help-overlay").forEach((el) => el.remove());
    app.relabel();
    if (!startFeedback.hidden) setStartFeedback("");
  });

  // paging / zoom keys
  window.addEventListener("keydown", (e) => {
    if (detail.screen === "library" || detail.screen === "search") return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); app.zoomBy(1.2); updateZoom(); }
    else if (mod && e.key === "-") { e.preventDefault(); app.zoomBy(1 / 1.2); updateZoom(); }
    else if (mod && e.key === "0") { e.preventDefault(); app.resetZoom(); updateZoom(); }
    else if (e.key === "PageDown") app.nextPage();
    else if (e.key === "PageUp") app.prevPage();
    else if (e.key === "Home" && e.ctrlKey) app.goToPage(0);
    else if (e.key === "End" && e.ctrlKey) app.goToPage(1e9);
  });

  await wireDragDrop(app, workspace, {
    onOpened: () => { library.detach(); revealWorkspace(); },
    onRecognitionStart: () => { setStartFeedback(""); setRecognitionBusy(true); },
    onRecognitionDone: (success) => {
      setRecognitionBusy(false);
      if (success) {
        library.detach();
        setMobileView("score");
        revealWorkspace();
      } else showRecognitionFailure();
    },
  });

  // 关页 / 关窗前有没存的内容先拦一下（草稿照存，真关了下次还能恢复）。
  // 无头回归脚本（`navigator.webdriver`）不拦：没人去点那个离开确认框。
  if (isTauriRuntime()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    let asking = false; // 确认框开着时再点关闭：不叠第二个框
    void getCurrentWindow().onCloseRequested(async (ev) => {
      if (asking) {
        ev.preventDefault();
        return;
      }
      asking = true;
      try {
        if (!(await app.confirmReplace(true))) ev.preventDefault();
      } finally {
        asking = false;
      }
    });
  } else if (!navigator.webdriver) {
    window.addEventListener("beforeunload", (ev) => {
      if (app.isDirty()) ev.preventDefault();
    });
  }

  // 上次没存的内容（自动保存的草稿）先读出来：自动加载上次的文件会把草稿当作已存删掉
  const draft = await app.takeDraft();
  // 自动加载上次打开的文件（仅 Tauri；失败则保持示例文本）
  if (await app.tryRestoreLastFile()) { session.detach(); revealWorkspace(); }
  // 草稿：问要不要恢复
  if (await app.offerDraftRestore(draft)) {
    await session.restoreDraft(draft?.nota);
    revealWorkspace();
  } else if(app.files.lastRestoreFailed) setStartFeedback(app.status);

  await detail.restoreInitialRoute();

  // 静默检查新版本（仅桌面版，自身还会判开关与 24h 节流）。延后是为了不和
  // 启动页、OMR 模型加载抢资源；查不到就什么都不做。
  setTimeout(() => void maybeAutoCheck(), 8000);
}


/** 缩放：按钮 + 指针锚定的滚轮/捏合手势。自成一体的一块，从 boot() 里拆出来。
 *  返回 updateZoom，供快捷键那边刷新百分比标签。 */
function wireZoomControls(
  app: App,
  scorePane: HTMLElement,
  on: (id: string, fn: () => void) => void,
): () => void {
  const zoomLabel = document.getElementById("btn-zoom-reset");
  const updateZoom = () => {
    if (zoomLabel) zoomLabel.textContent = `${Math.round(app.zoom * 100)}%`;
  };
  on("btn-zoom-in", () => { app.zoomBy(1.2); updateZoom(); });
  on("btn-zoom-out", () => { app.zoomBy(1 / 1.2); updateZoom(); });
  on("btn-zoom-reset", () => { app.resetZoom(); updateZoom(); });
  updateZoom();
  // 指针锚定缩放：以触点为中心，缩放后让触点下的内容点保持在原屏幕位置
  // （与双指预览图片一致）。连续的滚轮/捏合事件累积到 pending，按 rAF 每帧
  // 只应用一次——避免每个事件都触发一次「改 CSS 变量 → 强制同步布局」的抖动。
  let pendingZoom: number | null = null; // 目标 zoom（绝对值），null 表示无待处理
  let anchorX = 0, anchorY = 0;
  let rafId = 0;
  // 找触点落在哪一页（缩放前），间隙/页外则取最接近的页。页内 SVG 等比缩放，
  // 故基于该页自身的包围盒做锚定，天然规避了 score-pane 的居中/内边距偏移。
  const anchorPage = (y: number): HTMLElement | null => {
    const wraps = scorePane.querySelectorAll<HTMLElement>(".score-page-wrap");
    let best: HTMLElement | null = null;
    let bestDist = Infinity;
    for (const w of wraps) {
      const rc = w.getBoundingClientRect();
      if (y >= rc.top && y <= rc.bottom) return w;
      const d = y < rc.top ? rc.top - y : y - rc.bottom;
      if (d < bestDist) { bestDist = d; best = w; }
    }
    return best;
  };
  // 内容锚点：一段手势内固定的「谱面上的点」（锚定页 + 页内归一化坐标）。
  // 在手势开始时算一次并保持，避免低 zoom 居中阶段页位置变化污染归一化坐标；
  // 当前手指屏幕坐标 (anchorX/anchorY) 每个事件更新，故捏合平移时谱面随手指走。
  let gAnchor: { page: HTMLElement; fx: number; fy: number } | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const beginOrKeepAnchor = (clientX: number, clientY: number) => {
    if (!gAnchor) {
      const page = anchorPage(clientY);
      if (page) {
        const rc = page.getBoundingClientRect();
        gAnchor = { page, fx: (clientX - rc.left) / rc.width, fy: (clientY - rc.top) / rc.height };
      }
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { gAnchor = null; }, 250); // 手势空闲即结束
  };
  const flushZoom = () => {
    rafId = 0;
    if (pendingZoom === null) return;
    app.setZoom(pendingZoom);
    pendingZoom = null;
    if (gAnchor) {
      // 同步读取缩放后的包围盒，调整滚动让固定的内容点回到当前手指屏幕坐标
      const post = gAnchor.page.getBoundingClientRect();
      const wantLeft = anchorX - gAnchor.fx * post.width;
      const wantTop = anchorY - gAnchor.fy * post.height;
      scorePane.scrollLeft += post.left - wantLeft;
      scorePane.scrollTop += post.top - wantTop;
    }
    updateZoom();
  };
  const scheduleZoom = (target: number, clientX: number, clientY: number) => {
    pendingZoom = target;
    anchorX = clientX;
    anchorY = clientY;
    beginOrKeepAnchor(clientX, clientY);
    if (!rafId) rafId = requestAnimationFrame(flushZoom);
  };
  const zoomBy = (clientX: number, clientY: number, factor: number) => {
    const base = pendingZoom ?? app.zoom;
    scheduleZoom(base * factor, clientX, clientY);
  };

  // Chromium/Edge：捏合与 Ctrl+滚轮都表现为 ctrlKey 的 wheel 事件。
  scorePane.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoomBy(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  // WebKit/WKWebView（Tauri macOS）：触控板双指捏合走 gesture* 事件，带绝对 scale。
  let gestureBase = 1;
  type GEvt = Event & { scale: number; clientX: number; clientY: number };
  scorePane.addEventListener("gesturestart", (ev) => {
    const e = ev as GEvt;
    e.preventDefault();
    gestureBase = app.zoom;
    gAnchor = null; // 新捏合以新的双指中心为锚
  });
  scorePane.addEventListener("gesturechange", (ev) => {
    const e = ev as GEvt;
    e.preventDefault();
    scheduleZoom(gestureBase * e.scale, e.clientX, e.clientY);
  });
  scorePane.addEventListener("gestureend", (ev) => ev.preventDefault());

  return updateZoom;
}

interface RecognitionPickerHooks {
  onPicked: () => void;
  onDone: (success: boolean) => void;
}

async function pickRecognitionFile(app: App, hooks: RecognitionPickerHooks): Promise<void> {
  // 没有没存的内容时不 await：浏览器版的 `input.click()` 得留在点击手势的同步调用栈里
  if (app.isDirty() && !(await app.confirmReplace())) return;
  if (isTauriRuntime()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const sel = await open({
      multiple: true,
      filters: [{ name: t("start.filterImage"), extensions: [...IMAGE_EXT] }],
    });
    const paths = (Array.isArray(sel) ? sel : typeof sel === "string" ? [sel] : []).sort();
    if (!paths.length) return;
    const raw = [];
    for (const p of paths) raw.push({ bytes: await readFile(p), name: p });
    const files = await prepareRecognitionFiles(app,raw);
    if (!files) return;
    hooks.onPicked();
    let success = false;
    try {
      success = await app.omr.recognizeFiles(files);
    } finally {
      hooks.onDone(success);
    }
    return;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = IMAGE_ACCEPT;
  input.multiple = true;
  input.onchange = async () => {
    const picked = [...(input.files ?? [])].sort((a, b) => a.name.localeCompare(b.name, "zh"));
    if (!picked.length) return;
    const raw = [];
    for (const f of picked) raw.push({ bytes: new Uint8Array(await f.arrayBuffer()), mime: f.type, name: f.name });
    const files = await prepareRecognitionFiles(app,raw);
    if (!files) return;
    hooks.onPicked();
    let success = false;
    try {
      success = await app.omr.recognizeFiles(files);
    } finally {
      hooks.onDone(success);
    }
  };
  openFilePicker(input);
}

interface DropHooks {
  onOpened: () => void;
  onRecognitionStart: () => void;
  onRecognitionDone: (success: boolean) => void;
}

async function wireDragDrop(app: App, dropTarget: HTMLElement, hooks: DropHooks): Promise<void> {
  if (isTauriRuntime()) {
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    const { readFile } = await import("@tauri-apps/plugin-fs");
    await getCurrentWebview().onDragDropEvent(async (event) => {
      if (event.payload.type === "drop") {
        const path = event.payload.paths[0];
        if (!path) return;
        if (!isImageFile(path) && !isDocFile(path)) return;
        if (!(await app.confirmReplace())) return;
        if (isImageFile(path)) {
          // 拖入图片 → 本地 OMR 识别，完成后默认显示可编辑的排版结果。一次拖几张（五线谱的多页）按文件名排成一首
          const imgs = event.payload.paths.filter((p) => isImageFile(p)).sort();
          const raw = [];
          for (const p of imgs) raw.push({ bytes: await readFile(p), name: p });
          const files = await prepareRecognitionFiles(app,raw);
          if (!files) return;
          hooks.onRecognitionStart();
          let success = false;
          try {
            success = await app.omr.recognizeFiles(files);
          } finally {
            hooks.onRecognitionDone(success);
          }
          return;
        }
        if (!isDocFile(path)) return;
        const bytes = await readFile(path);
        if(!(await app.openBytes(bytes,path,true))) return;
        app.rememberLastFile(path);
        hooks.onOpened();
      }
    });
  } else {
    dropTarget.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropTarget.classList.add("drag-active");
    });
    dropTarget.addEventListener("dragleave", (e) => {
      if (!dropTarget.contains(e.relatedTarget as Node | null)) dropTarget.classList.remove("drag-active");
    });
    dropTarget.addEventListener("drop", async (e) => {
      e.preventDefault();
      dropTarget.classList.remove("drag-active");
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      // 文件清单在事件回调返回后就读不到了：先全取出来，再问要不要换掉没存的内容
      const dropped = [...(e.dataTransfer?.files ?? [])];
      const buf = new Uint8Array(await file.arrayBuffer());
      const isImage = (f: File) => isImageFile(f.name) || f.type.startsWith("image/");
      if (!isImage(file) && !isDocFile(file.name)) return;
      if (!(await app.confirmReplace())) return;
      if (isImageFile(file.name) || file.type.startsWith("image/")) {
        // 一次拖几张（五线谱的多页）按文件名排成一首
        const all = dropped.filter((f) => isImageFile(f.name) || f.type.startsWith("image/"))
          .sort((a, b) => a.name.localeCompare(b.name, "zh"));
        const raw = [];
        for (const f of all) raw.push({ bytes: f === file ? buf : new Uint8Array(await f.arrayBuffer()), mime: f.type, name: f.name });
        const files = await prepareRecognitionFiles(app,raw);
        if (!files) return;
        hooks.onRecognitionStart();
        let success = false;
        try {
          success = await app.omr.recognizeFiles(files);
        } finally {
          hooks.onRecognitionDone(success);
        }
        return;
      }
      // 与 Tauri 分支同一套白名单：以前这里不判，拖进任意文件都会试着导入。
      if (!isDocFile(file.name)) return;
      if(!(await app.openBytes(buf,file.name,true))) return;
      hooks.onOpened();
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  boot().catch((e) => {
    console.error(e);
    document.body.insertAdjacentHTML(
      "beforeend",
      `<pre style="color:red;white-space:pre-wrap">${String(e?.stack ?? e)}</pre>`,
    );
  });
});

/** 无头回归脚本用的排版入口：唯一的 `ScorePainter`、就绪的资源、五线谱缺省排版选项。 */
function paintProbe(meta: MetaData) {
  return {
    ScorePainter,
    resources: PaintResources.fixed(meta),
    staffOptions: (): MixedOptions => staffOptionsOf(meta),
  };
}
