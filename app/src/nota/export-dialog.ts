import type { App, PaperEngine } from "../editor/app";
import type { ScorePainter } from "../layout/painter";
import { openModal, showOptionsDialog } from "../editor/dialogs";
import { exportJianpuPdf, exportJianpuPng, exportMixedPdf, exportCurrentPagePng, showExportDialog, showSaveAsDialog } from "../editor/export";
import { ORIGINAL_PAPERS, PAGE_RATIOS } from "../style/themes";
import { pageMargins, resolvePaper } from "../style/paper";
import { footerControls } from "./footer-controls";
import { exportFooterContext, FOOTER_STYLE, layoutFooter, readFooterOptions, writeFooterOptions } from "./export-footer";
import { notaMarkPaths } from "./nota-mark";
import "./export-dialog.css";

const NS = "http://www.w3.org/2000/svg";
const button = (text: string, run: () => void) => {
  const el = document.createElement("button"); el.type = "button"; el.textContent = text; el.onclick = run; return el;
};
function field(text: string, input: HTMLElement): HTMLLabelElement {
  const el = document.createElement("label"); el.append(document.createTextNode(text), input); return el;
}
function choices(items: readonly (readonly [string, string])[], value: string): HTMLSelectElement {
  const select = document.createElement("select");
  for (const [id, text] of items) { const option = document.createElement("option"); option.value = id; option.textContent = text; select.append(option); }
  select.value = value; return select;
}

/** Both detail modes use the same live settings and the existing complete exporters. */
export function showNotaExport(app: App): void {
  const body = document.createElement("div"); body.className = "nota-export-body";
  const grid = document.createElement("div"); grid.className = "nota-export-grid";
  const mixed = app.mode === "mixed";
  const expanded = !mixed && app.viewMode === "expanded";
  const engine: PaperEngine = mixed ? "staff" : "jianpu";
  const paperState = app.paperState(engine);
  const following = !!paperState.doc && !paperState.userSet;
  const paperValue = expanded ? Object.keys(PAGE_RATIOS).find(key => PAGE_RATIOS[key][0] === app.pageW && PAGE_RATIOS[key][1] === app.pageH) ?? "current"
    : following ? "follow" : paperState.page.paper ?? "current";
  const paperItems: [string, string][] = expanded
    ? Object.keys(PAGE_RATIOS).map(key => [key, `投影 ${key}`])
    : [...(paperState.doc ? [["follow", "跟随曲谱文件"] as [string, string]] : []), ...ORIGINAL_PAPERS.map(key => [key, key] as [string, string])];
  if (!paperItems.some(([id]) => id === paperValue)) paperItems.unshift([paperValue, "当前自定义版面"]);
  const paper = choices(paperItems, paperValue); paper.setAttribute("aria-label", expanded ? "投影比例" : "纸张");
  const currentSize = resolvePaper(paperState.page);
  const orientation = choices([["portrait", "竖向"], ["landscape", "横向"]], currentSize && currentSize.w > currentSize.h ? "landscape" : "portrait");
  orientation.setAttribute("aria-label", "纸张方向");
  const size = document.createElement("input"); size.type = "number";
  const staffState = app.staffSizeState();
  size.min = mixed ? "3" : "12"; size.max = mixed ? "15" : "72"; size.step = mixed ? "0.1" : "1";
  size.value = String(mixed ? staffState.user.mm ?? staffState.doc.mm ?? 7 : app.fontSize);
  size.setAttribute("aria-label", mixed ? "谱表大小（mm）" : "数字大小（pt）");
  grid.append(field(expanded ? "比例" : "纸张", paper));
  if (!expanded) grid.append(field("方向", orientation));
  grid.append(field(mixed ? "谱表（mm）" : "数字（pt）", size));
  const lyrics = document.createElement("input"); lyrics.type = "checkbox"; lyrics.checked = app.showLyrics;
  const lyricLabel = field("显示歌词", lyrics); lyricLabel.className = "nota-export-check";
  const status = document.createElement("p"); status.className = "nota-export-summary"; status.setAttribute("aria-live", "polite");
  const error = document.createElement("p"); error.className = "nota-export-error"; error.hidden = true; error.setAttribute("role", "alert");
  const pdf = button("下载 PDF / 打印", () => void run("pdf")); pdf.className = "modal-button-primary";
  const png = button("下载 PNG 图片", () => void run("png"));
  const primary = document.createElement("div"); primary.className = "nota-export-primary"; primary.append(pdf, png);
  const footerOptions = readFooterOptions();
  const footer = document.createElement("details");
  const footerTitle = document.createElement("summary"); footerTitle.textContent = "页脚与简谱输出";
  const footerUi = footerControls(footerOptions);
  const footerPreview = document.createElementNS(NS, "svg"); footerPreview.classList.add("nota-footer-preview"); footerPreview.setAttribute("role", "img"); footerPreview.setAttribute("aria-label", "当前页脚布局示意");
  const accidental = choices([["explicit", "逐音明确标注"], ["measure", "小节内延续"]], app.jianpuAccidentals);
  accidental.setAttribute("aria-label", "简谱升降号模式");
  accidental.onchange = () => { app.setJianpuAccidentals(accidental.value === "measure" ? "measure" : "explicit"); void update(); };
  footer.append(footerTitle, footerUi, footerPreview, field("升降号", accidental));
  footerUi.addEventListener("change", () => { writeFooterOptions(footerOptions); void update(); });
  const other = document.createElement("details");
  const otherTitle = document.createElement("summary"); otherTitle.textContent = "其他格式与可编辑文件";
  const otherHint = document.createElement("p"); otherHint.textContent = "可编辑乐谱（.123）可重新导入；识谱原图需保留完整 .dolce 项目。PPTX 按展开档导出，其他格式沿用各自支持范围。";
  other.append(otherTitle, otherHint,
    button("可编辑乐谱（.123）、PPTX、MIDI 等", () => { close(); showExportDialog(app); }),
    button("原格式另存 / 完整识别项目", () => { close(); showSaveAsDialog(app); }));
  const hint = document.createElement("p"); hint.className = "nota-export-hint";
  hint.textContent = "选项即时应用，记在当前浏览器；版面属于当前排版档。导出不保存入库。PDF 下载后可打印。";
  const advanced = button("完整排版设置", () => { close(); showOptionsDialog(app); }); advanced.className = "nota-export-advanced";
  body.append(grid, lyricLabel, status, primary, error, footer, other, hint, advanced);
  let busy = false;
  let updateVersion = 0;
  const observer = new MutationObserver(() => void update());
  observer.observe(app.scorePane, {childList: true});
  const done = button("关闭", () => close());
  const { close } = openModal({title: "导出", boxClass: "nota-export-box", body: [body], footer: [done], onClose: () => { observer.disconnect(); updateVersion++; }});
  function drawFooter(painter: ScorePainter | null) {
    if (!painter?.pageCount) { footerPreview.replaceChildren(); return; }
    const index = Math.min(app.pageIndex, painter.pageCount - 1);
    const page = painter.pageSize(index);
    const continuous = !expanded && !resolvePaper(app.paperState(engine).page);
    const source = [painter.footerSource(index), app.exportSourceDescription].filter(Boolean).join(" · ");
    const layout = layoutFooter({...exportFooterContext(), options: footerOptions, source}, index, painter.pageCount, continuous, page.w, page.h);
    const height = Math.max(30, layout.rows * FOOTER_STYLE.leading + 16);
    footerPreview.setAttribute("viewBox", `0 0 ${page.w} ${height}`);
    footerPreview.replaceChildren();
    footerPreview.setAttribute("fill", FOOTER_STYLE.color); footerPreview.setAttribute("font-size", String(FOOTER_STYLE.size)); footerPreview.setAttribute("font-family", "Arial, sans-serif");
    for (const item of layout.labels) {
      const text = document.createElementNS(NS, "text"); text.textContent = item.text;
      text.setAttribute("x", String(item.x + (item.align === "right" ? item.width : 0)));
      text.setAttribute("y", String(12 + item.row * FOOTER_STYLE.leading)); text.setAttribute("text-anchor", item.align === "right" ? "end" : "start"); footerPreview.append(text);
    }
    if (layout.mark) {
      const mark = layout.mark; const group = document.createElementNS(NS, "g");
      group.setAttribute("transform", `translate(${mark.x} ${12 + mark.row * FOOTER_STYLE.leading - mark.height * .85})`);
      for (const shape of notaMarkPaths(mark.height)) {
        const path = document.createElementNS(NS, "path"); path.setAttribute("d", shape.segs.map(seg => `${seg.op}${seg.pts.join(" ")}`).join(" "));
        path.setAttribute("fill", shape.fill ? FOOTER_STYLE.color : "none");
        if (shape.strokeWidth) { path.setAttribute("stroke", FOOTER_STYLE.color); path.setAttribute("stroke-width", String(shape.strokeWidth)); path.setAttribute("stroke-linecap", "round"); path.setAttribute("stroke-linejoin", "round"); }
        group.append(path);
      }
      footerPreview.append(group);
    }
    if (!layout.rows) { const text = document.createElementNS(NS, "text"); text.textContent = "无页脚"; text.setAttribute("x", "24"); text.setAttribute("y", "16"); footerPreview.append(text); }
  }
  async function update() {
    const version = ++updateVersion;
    orientation.disabled = expanded || paper.value === "follow" || paper.value === "长图";
    await app.whenIdle(); if (version !== updateVersion) return;
    const live = app.mode === "mixed" ? app.mixedPainter : app.painter;
    const painter = live ? await live.outputForLyrics(app.showLyrics) : null;
    if (version !== updateVersion) return;
    const count = painter?.pageCount ?? 0;
    const page = count ? painter!.pageSize(0) : null;
    status.textContent = `${app.viewMode === "expanded" ? "展开档" : mixed ? "五线谱 / 混排" : "原样档"} · ${page ? `${Math.round(page.w)}×${Math.round(page.h)} pt · ` : ""}${count} 页${!mixed && count > 1 ? " · PNG 将下载 ZIP（全部页面）" : mixed ? ` · PNG 仅第 ${Math.min(app.pageIndex, count - 1) + 1} 页` : ""}`;
    if (expanded) status.textContent += " · 打印纸请先切换原样档";
    pdf.disabled = png.disabled = busy || count === 0 || app.mode === "recognize";
    if (app.mode === "recognize") status.textContent += " · 请先切回排版视图";
    drawFooter(painter);
  }
  function applyPaper() {
    if (expanded) {
      const wh = PAGE_RATIOS[paper.value]; if (wh) app.applyRenderSettings({pageW: wh[0], pageH: wh[1]});
    } else if (paper.value === "follow") app.applyRenderSettings({paper: {[engine]: "follow"}});
    else if (paper.value !== "current") app.applyRenderSettings({paper: {[engine]: {paper: paper.value, orientation: orientation.value as "portrait" | "landscape", margin: pageMargins(app.paperState(engine).page) ?? null}}});
    void update();
  }
  paper.onchange = orientation.onchange = applyPaper;
  size.onchange = () => {
    const value = Number(size.value); if (!size.checkValidity() || !Number.isFinite(value)) return;
    app.applyRenderSettings(mixed ? {staffSize: {mm: value}} : {fontSize: value}); void update();
  };
  lyrics.onchange = () => { app.setShowLyrics(lyrics.checked); void update(); };
  async function run(format: "pdf" | "png") {
    if (busy) return; busy = true; error.hidden = true; void update();
    grid.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select").forEach(el => el.disabled = true);
    try {
      if (format === "pdf") await (mixed ? exportMixedPdf(app) : exportJianpuPdf(app));
      else await (mixed ? exportCurrentPagePng(app) : exportJianpuPng(app));
      status.textContent = "已生成并请求下载，请在系统下载或文件应用中查看。";
    } catch (e) { error.textContent = e instanceof Error ? e.message : String(e); error.hidden = false; }
    finally { busy = false; grid.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select").forEach(el => el.disabled = false); pdf.disabled = png.disabled = false; orientation.disabled = expanded || paper.value === "follow" || paper.value === "长图"; }
  }
  void update();
}

export function mountNotaExport(app: App): void {
  for (const id of ["nota-detail-export", "nota-edit-export"]) {
    const el = document.getElementById(id); if (el) el.onclick = () => showNotaExport(app);
  }
}
