import type { App } from "../editor/app";
import type { DocFormatId } from "../editor/formats";
import { exportJianpuPdf, exportJianpuPng } from "../editor/export";
import { KEYS, convertPracticeText, keyLabel, type ConversionMode } from "./convert";
import "./practice.css";
import { showFooterSettings } from "./footer-settings";
import { compareReference, scoreReference } from "./structured-score";
import { parse123 } from "../j123/parse";
import { t } from "../i18n";

/** A small addition to Dolce's workbench; all editing and playback stay upstream. */
export function mountPracticePanel(app: App): void {
  const panel = document.createElement("section");
  panel.id = "nota-practice";
  panel.setAttribute("aria-label", "练习谱转换");
  panel.innerHTML = `
    <div class="practice-heading">
      <div><span class="practice-kicker">NOTA · 练习谱</span><h2>把这首曲子，变成练习谱</h2></div>
      <span id="practice-source" class="practice-source">先打开一份乐谱</span>
    </div>
    <div class="practice-controls">
      <fieldset class="practice-modes"><legend class="sr-only">转换方式</legend>
        <label class="practice-mode"><input type="radio" name="practice-mode" value="transpose" checked>
          <span><strong>实际移调</strong><small>数字关系保留，声音随调改变</small></span></label>
        <label class="practice-mode"><input type="radio" name="practice-mode" value="renotate">
          <span><strong>保持音高，重新记谱</strong><small>声音与音区不变，重算数字和升降号</small></span></label>
      </fieldset>
      <label class="practice-target">目标基准<select id="practice-key" aria-label="目标基准">${KEYS.map((k) => `<option value="${k.fifths}">1=${k.name}</option>`).join("")}</select></label>
      <button id="practice-apply" class="button button-primary">转换并预览 <span aria-hidden="true">→</span></button>
    </div>
    <div class="practice-bottom">
      <p id="practice-explain">选择孩子适合弹的调，旋律关系和节奏保持不变。</p>
      <div class="practice-exports">
        <label>${t("practice.size.label")}<select id="practice-size" aria-label="${t("practice.size.aria")}"><option value="20">${t("practice.size.large")}</option><option value="16">${t("practice.size.standard")}</option><option value="24">${t("practice.size.extraLarge")}</option></select></label>
        <button id="practice-a4" class="button button-secondary">A4 练习版</button>
        <button id="practice-png" class="button button-secondary">下载 PNG</button>
        <button id="practice-pdf" class="button button-secondary">下载 A4 PDF</button>
        <button id="practice-footer" class="practice-restore">${t("settings.footer.title")}</button>
        <button id="practice-restore" class="practice-restore" disabled>还原转换</button>
      </div>
    </div>
    <p id="practice-result" class="practice-result" role="status" aria-live="polite" hidden></p>`;
  document.getElementById("toolbar")!.after(panel);
  const el = <T extends HTMLElement>(id: string) => panel.querySelector<T>(`#${id}`)!;
  const key = el<HTMLSelectElement>("practice-key");
  const size = el<HTMLSelectElement>("practice-size");
  const restore = el<HTMLButtonElement>("practice-restore");
  const result = el<HTMLParagraphElement>("practice-result");
  let previous: { text: string; format: DocFormatId; path: string | null; converted: string } | null = null;
  let busy = false;
  let observedText = app.getText();
  const mode = () => panel.querySelector<HTMLInputElement>("input[name=practice-mode]:checked")!.value as ConversionMode;
  const feedback = (message: string, error = false) => {
    result.textContent = message;
    result.hidden = !message;
    result.classList.toggle("is-error", error);
  };
  const refresh = () => {
    const selectedSize = app.practiceFontSize ?? app.fontSize;
    let custom = size.querySelector<HTMLOptionElement>("option[data-custom]");
    if (![16, 20, 24].includes(selectedSize)) {
      if (!custom) { custom = document.createElement("option"); custom.dataset.custom = "true"; size.append(custom); }
      custom.value = String(selectedSize);
      custom.textContent = t("practice.size.custom", { size: selectedSize });
    } else custom?.remove();
    size.value = String(selectedSize);
    const text = app.getText();
    if (!busy && text !== observedText) feedback("");
    observedText = text;
    const doc = app.scoreDoc();
    const song = doc?.songs[0];
    el("practice-source").textContent = song ? `当前记谱 1=${keyLabel(song.key?.fifths ?? 0)}` : "先打开一份乐谱";
    restore.disabled = busy || !previous || previous.converted !== app.getText() || app.docFormat !== "123";
    for (const id of ["practice-apply", "practice-a4", "practice-png", "practice-pdf"]) {
      el<HTMLButtonElement>(id).disabled = busy || !song;
    }
  };
  const run = async (button: HTMLButtonElement, work: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    const text = button.textContent;
    button.textContent = "处理中…";
    refresh();
    try { await work(); } catch (e) { feedback(e instanceof Error ? e.message : String(e), true); }
    finally { busy = false; button.textContent = text; refresh(); }
  };
  const a4 = async () => {
    // Capture before changing view: original and expanded keep independent styles.
    const fontSize = Number(size.value);
    await app.setViewMode("original");
    app.applyRenderSettings({
      paper: { jianpu: { paper: "A4", orientation: "portrait", margin: [40, 40, 40, 40] } },
      fontSize, color: 0xff000000, bgColor: 0xffffffff,
    });
    await app.whenIdle();
  };
  panel.querySelectorAll<HTMLInputElement>("input[name=practice-mode]").forEach((input) => {
    input.addEventListener("change", () => {
      el("practice-explain").textContent = mode() === "renotate"
        ? "保留每个音的声音和音区，用新的 1= 基准表达；可能出现更多升降号。"
        : "选择孩子适合弹的调，旋律关系和节奏保持不变。";
    });
  });
  el<HTMLButtonElement>("practice-apply").onclick = function () {
    void run(el("practice-apply"), async () => {
      app.playback.stop();
      const doc = app.scoreDoc();
      if (!doc || doc.songs.length !== 1 || doc.songs[0]?.parts.length !== 1 ||
          doc.songs[0].parts[0]!.measures.some((m) => m.elements.some((e) => e.kind === "chord" && (e.notes.length > 1 || e.voice > 1)))) {
        throw new Error("这一版先支持单首、单旋律谱，请先取出主旋律。");
      }
      const source = app.convertTo("123");
      if (!source) throw new Error("这份乐谱暂时无法转换，请先核对谱面。");
      if (app.docFormat === "abc" || app.docFormat === "musicxml") {
        const differences = compareReference(scoreReference(doc), scoreReference(parse123(source)));
        if (differences.length) throw new Error(`转换为 123 会改变原谱：${differences[0]}。已保留原格式，请先在原谱中编辑或打印。`);
      }
      const converted = convertPracticeText(source, Number(key.value), mode());
      const before = { text: app.getText(), format: app.docFormat, path: app.filePath, converted: converted.text };
      if (app.docFormat === "123") app.replaceText(converted.text, "input.nota");
      else {
        app.adoptText("123", converted.text, null);
        app.formats.use(null);
      }
      previous = before;
      await a4();
      const change = mode() === "renotate" ? "音高与音区保持不变" : `实际音高${converted.shift < 0 ? "降低" : "升高"} ${Math.abs(converted.shift)} 个半音`;
      feedback(`${converted.sourceKey} → ${converted.targetKey} · ${change} · ${converted.notes} 个音。开头：${converted.preview}${converted.warning ? `　${converted.warning}` : ""}`);
    });
  };
  restore.onclick = () => {
    if (!previous || previous.converted !== app.getText()) return;
    app.playback.stop();
    app.adoptText(previous.format, previous.text, previous.path);
    app.formats.use(null);
    previous = null;
    observedText = app.getText();
    feedback("已还原到本次转换前的乐谱。");
    refresh();
  };
  el<HTMLButtonElement>("practice-a4").onclick = function () {
    void run(el("practice-a4"), async () => { await a4(); feedback(`已排为 A4 竖版，数字 ${size.value} pt。可继续编辑或直接下载。`); });
  };
  size.onchange = () => {
    app.setPracticeFontSize(Number(size.value));
    void run(el("practice-a4"), a4);
  };
  el<HTMLButtonElement>("practice-pdf").onclick = function () {
    void run(el("practice-pdf"), async () => { await a4(); await exportJianpuPdf(app); feedback("A4 PDF 已生成，可直接打印。"); });
  };
  el<HTMLButtonElement>("practice-png").onclick = function () {
    void run(el("practice-png"), async () => { await a4(); await exportJianpuPng(app); feedback("PNG 已生成；多页乐谱会打包为 ZIP。"); });
  };
  el<HTMLButtonElement>("practice-footer").onclick = showFooterSettings;
  app.view.dom.addEventListener("input", refresh);
  // The existing importer, visual editor and format switch all replace page DOM.
  new MutationObserver(refresh).observe(document.getElementById("score-pane")!, { childList: true });
  refresh();
}
