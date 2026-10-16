import shell from "./dolce-shell.html?raw";
import upstreamStyles from "../../styles.css?inline";
import { buildPalette } from "../../editor/visual/menu";
import type { VisualMode } from "../../editor/visual/keys";

/** Separate page, isolated original CSS, original responsive breakpoints; mock runner only. */
export function mountDolceWorkspace(iframe: HTMLIFrameElement, title: string) {
  iframe.addEventListener("load", () => {
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.querySelector("#app")?.classList.remove("is-starting");
    doc.querySelector("#start-screen")?.remove();
    // Inline fallback brand: no remote asset loading in the self-contained review artifact.
    const mark = doc.querySelector<HTMLImageElement>(".brand-mark");
    if (mark) mark.remove();
    const code = doc.querySelector<HTMLElement>("#code-pane")!;
    const input = doc.createElement("textarea");
    input.setAttribute("aria-label", "乐谱源码（原型占位）");
    input.value = 'X:1\nT:' + title + '\nM:4/4\nK:1=bE\n1 1 5 5 | 6 6 5 - |\nw:一闪一闪亮晶晶\n4 4 3 3 | 2 2 1 - |';
    input.style.cssText = "width:100%;height:100%;resize:none;border:0;background:transparent;color:inherit;padding:14px;font:14px/1.8 monospace";
    code.appendChild(input);
    doc.querySelector("#code-pane-meta")!.textContent = "123 · 演示稿";
    const pane = doc.querySelector("#score-pane")!;
    const sheet = doc.createElement("div");
    sheet.style.cssText = "background:#fff;color:#222;padding:30px 24px;margin:18px;min-width:260px;min-height:400px;text-align:center";
    const heading = doc.createElement("h2"); heading.textContent = title; heading.style.cssText = "font:26px serif;margin:0 0 25px";
    sheet.append(heading);
    const meta = doc.createElement("p"); meta.textContent = "1=E♭　4/4"; meta.style.cssText = "text-align:left;font:13px sans-serif"; sheet.append(meta);
    for (const line of ["1 1 5 5　│　6 6 5 −", "4 4 3 3　│　2 2 1 −", "5 5 4 4　│　3 3 2 −", "5 5 4 4　│　3 3 2 −"]) {
      const row = doc.createElement("p"); row.textContent = line; row.style.cssText = "font:22px/1.8 serif;white-space:nowrap;margin:30px 0"; sheet.append(row);
    }
    pane.append(sheet);
    const status = doc.querySelector("#status")!;
    const notice = (text: string) => { status.textContent = text + " · 布局演示，未连接编辑引擎"; };
    notice("Dolce 原布局与原响应式规则");
    let mode: VisualMode = "edit";
    const palette = doc.querySelector<HTMLElement>("#visual-palette")!;
    const refresh = buildPalette(palette, {
      get mode() { return mode; }, surface: "jianpu",
      run(a) { if (a.id === "mode.insert" || a.id === "mode.edit") { mode = a.id === "mode.insert" ? "insert" : "edit"; refresh(); } notice(a.label); return true; }, refocus() {},
    });
    refresh();
    const speed = doc.querySelector("#sel-speed")!;
    speed.innerHTML = '<option>1×</option><option>0.75×</option><option>0.5×</option>';
    const mobile = (which: string) => {
      doc.querySelector("#body")?.classList.toggle("mobile-code", which === "code");
      for (const v of ["code", "score"]) {
        const b = doc.querySelector("#btn-mobile-" + v)!;
        b.classList.toggle("active", v === which); b.setAttribute("aria-pressed", String(v === which));
      }
    };
    doc.addEventListener("click", e => {
      const button = (e.target as Element).closest<HTMLButtonElement>("button"); if (!button || palette.contains(button)) return;
      if (button.id === "btn-palette") { palette.hidden = !palette.hidden; button.setAttribute("aria-pressed", String(!palette.hidden)); }
      else if (button.id === "btn-mobile-code") mobile("code");
      else if (button.id === "btn-mobile-score") mobile("score");
      else if (button.id.startsWith("btn-view-")) {
        for (const b of doc.querySelectorAll("#view-mode-switch button")) { b.classList.toggle("active", b === button); b.setAttribute("aria-pressed", String(b === button)); }
        notice(button.textContent || "排版");
      } else if (button.id === "btn-header-more") doc.querySelector("#header-tools")?.classList.toggle("is-open");
      else notice(button.textContent?.trim() || button.getAttribute("aria-label") || "操作");
    });
  }, { once: true });
  // Preserve upstream styles exactly; only placeholder content receives inline sizing.
  iframe.srcdoc = '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + upstreamStyles + '</style></head><body>' + shell.replace(/<img[^>]*class="brand-mark"[^>]*>/g, '') + '</body></html>';
}
