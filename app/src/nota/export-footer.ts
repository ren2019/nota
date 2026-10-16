import { NOTA_MARK_RATIO, notaMarkPaths } from "./nota-mark";
import { measureGlyphText } from "../common/measure";
/** Shared export-only branding. Never written into the score or its layout. */
export const NOTA_NAME = "Nota";
export const NOTA_SLOGAN = "A simple way to make sheet music.";
export const FOOTER_BRAND = `Typeset with ${NOTA_NAME}`;
export const FOOTER_STYLE = { size: 7.5, color: "#888888", margin: 24, bottom: 18, gap: 8, leading: 10, columnGap: 16, markGap: 3 } as const;
export interface FooterOptions {
  brand: boolean;
  date: boolean;
  pageNumbers: boolean;
  // A future author credit can be added here without changing score data.
}
export const DEFAULT_FOOTER: Readonly<FooterOptions> = { brand: true, date: true, pageNumbers: true };
const STORAGE_KEY = "nota.exportFooter.v1";

export function localExportDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function readFooterOptions(): FooterOptions {
  let value: Partial<FooterOptions> = {};
  try { value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { /* private storage */ }
  return Object.fromEntries(Object.entries(DEFAULT_FOOTER).map(([key, fallback]) =>
    [key, typeof value?.[key as keyof FooterOptions] === "boolean" ? value[key as keyof FooterOptions] : fallback])) as unknown as FooterOptions;
}

export function writeFooterOptions(options: FooterOptions): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(options)); } catch { /* current export still works */ }
}

export interface FooterContext { options: FooterOptions; date: string; source?: string; /* Future user credit belongs in the information row. */ }
export function exportFooterContext(): FooterContext {
  return { options: readFooterOptions(), date: localExportDate() };
}

export function footerText(context: FooterContext, index: number, count: number, continuous = false): { left: string; right: string; brand: string } {
  return {
    left: context.source?.trim() ?? "",
    right: [context.options.date ? context.date : "", context.options.pageNumbers && !continuous && count > 1 ? `${index + 1} / ${count}` : ""].filter(Boolean).join(" · "),
    brand: context.options.brand ? `${FOOTER_BRAND} · ${NOTA_SLOGAN}` : "",
  };
}

export interface FooterLabel { text: string; x: number; width: number; align: "left" | "right"; row: number }

/** Fixed pages reserve at most a quarter of their height for this footer.
 * Very small pages reduce padding; a page unable to fit one readable 7.5pt
 * line omits the footer rather than placing labels outside the page. */
function footerCapacity(height: number) {
  const bottom = Math.min(FOOTER_STYLE.bottom, height / 16);
  const gap = Math.min(FOOTER_STYLE.gap, height / 32);
  const rows = Math.max(0, Math.floor((height / 4 - bottom - gap - FOOTER_STYLE.size) / FOOTER_STYLE.leading) + 1);
  return { bottom, gap, rows };
}

export interface FooterMark { x: number; width: number; height: number; row: number }

/** One shared two-tier layout: score information first, then the complete
 * left-aligned brand group. Fixed pages abbreviate; long images retain text. */
export function layoutFooter(context: FooterContext, index: number, count: number, continuous: boolean, width: number, height: number,
  measure: (text: string) => number = text => measureGlyphText(text, "Arial, sans-serif", FOOTER_STYLE.size).width): { labels: FooterLabel[]; rows: number; mark?: FooterMark } {
  const text = footerText(context, index, count, continuous);
  const margin = Math.min(FOOTER_STYLE.margin, width / 8);
  const inner = Math.max(0, width - 2 * margin);
  const limit = continuous ? Infinity : footerCapacity(height).rows;
  function wrap(value: string, available: number): string[] {
    if (!value || available < measure("…")) return [];
    return value.split(/\r?\n/).flatMap(paragraph => {
      const out: string[] = [];
      let line = "";
      for (const ch of paragraph) {
        if (line && measure(line + ch) > available) { out.push(line.trimEnd()); line = ""; }
        line += measure(ch) <= available ? ch : "…";
      }
      if (line.trim()) out.push(line.trimEnd());
      return out;
    });
  }
  function fit(lines: string[], available: number, count: number): string[] {
    if (count <= 0) return [];
    if (lines.length <= count) return lines;
    const kept = lines.slice(0, count);
    const tail = [...kept[kept.length - 1]!];
    while (tail.length && measure(tail.join("") + "…") > available) tail.pop();
    kept[kept.length - 1] = tail.join("").trimEnd() + "…";
    return kept;
  }
  const both = !!(text.left && text.right);
  const gap = both ? Math.min(FOOTER_STYLE.columnGap, inner / 10) : 0;
  // Reserve only the actual date/page label width on normal paper. Narrow
  // paper shares the line and wraps instead of starving the source column.
  const rightWidth = text.right ? Math.min(measure(text.right), both ? inner / 2 : inner) : 0;
  const leftWidth = Math.max(0, inner - (text.right ? rightWidth + gap : 0));
  const rawLeft = wrap(text.left, leftWidth), rawRight = wrap(text.right, rightWidth);
  const hasInfo = rawLeft.length > 0 || rawRight.length > 0;
  const markWidth = FOOTER_STYLE.size * NOTA_MARK_RATIO;
  const brandX = margin + markWidth + FOOTER_STYLE.markGap;
  const brandWidth = Math.max(0, inner - markWidth - FOOTER_STYLE.markGap);
  const brand = fit(wrap(text.brand, brandWidth), brandWidth, Math.max(0, limit - (hasInfo ? 1 : 0)));
  const infoLimit = limit - brand.length;
  const left = fit(rawLeft, leftWidth, infoLimit), right = fit(rawRight, rightWidth, infoLimit);
  const infoRows = Math.max(left.length, right.length);
  const labels: FooterLabel[] = [];
  for (const [lines, align, x, available] of [[left, "left", margin, leftWidth], [right, "right", width - margin - rightWidth, rightWidth]] as const)
    for (const [row, value] of lines.entries()) labels.push({ text: value, align, x, width: available, row });
  for (const [index, value] of brand.entries()) labels.push({ text: value, align: "left", x: brandX, width: brandWidth, row: infoRows + index });
  return { labels, rows: infoRows + brand.length,
    ...(brand.length ? { mark: { x: margin, row: infoRows, width: markWidth, height: FOOTER_STYLE.size } } : {}),
  };
}

/** Fit the export as a whole without changing notes or pagination. The shared
 * layout already abbreviates fixed-page labels; long images can grow. */
export function footerPlacement(height: number, contentBottom: number, continuous: boolean, enabled: boolean, rows = 1) {
  if (!enabled) return { height, baseline: 0, scale: 1 };
  const capacity = continuous ? { bottom: FOOTER_STYLE.bottom, gap: FOOTER_STYLE.gap, rows } : footerCapacity(height);
  const visibleRows = Math.min(rows, capacity.rows);
  if (visibleRows === 0) return { height, baseline: 0, scale: 1 };
  const band = capacity.bottom + FOOTER_STYLE.size + capacity.gap + Math.max(0, visibleRows - 1) * FOOTER_STYLE.leading;
  const outputHeight = continuous ? Math.max(height, contentBottom + band) : height;
  return {
    height: outputHeight,
    baseline: outputHeight - capacity.bottom,
    scale: contentBottom > 0 ? Math.min(1, Math.max(Number.EPSILON, (outputHeight - band) / contentBottom)) : 1,
  };
}

/** Work on a clone; screen SVGs, editor hit targets and score layout stay intact.
 * Size is in physical points (staff SVG viewBoxes use another coordinate scale). */
export function withExportFooter(source: SVGSVGElement, size: { w: number; h: number }, index: number, count: number,
  continuous: boolean, context: FooterContext): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = source.cloneNode(true) as SVGSVGElement;
  svg.querySelectorAll(".slide-footer").forEach((el) => el.remove());
  const vb = source.getAttribute("viewBox")!.split(/[\s,]+/).map(Number);
  const units = vb[2]! / size.w;
  const content = document.createElementNS(ns, "g");
  while (svg.firstChild) content.append(svg.firstChild);
  svg.append(content);
  // A connected, hidden SVG is needed for accurate music/lyrics ink bounds.
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none";
  host.append(svg);
  document.body.append(host);
  let bottom: number;
  try { const box = content.getBBox(); bottom = (box.y + box.height) / units; }
  finally { svg.remove(); host.remove(); }
  const layout = layoutFooter(context, index, count, continuous, size.w, size.h);
  const placement = footerPlacement(size.h, bottom, continuous, layout.rows > 0, layout.rows);
  if (placement.scale < 1) content.setAttribute("transform", `scale(${placement.scale})`);
  svg.setAttribute("viewBox", `0 0 ${vb[2]} ${placement.height * units}`);
  svg.setAttribute("width", String(size.w));
  svg.setAttribute("height", String(placement.height));
  const footer = document.createElementNS(ns, "g");
  footer.setAttribute("class", "nota-export-footer");
  footer.setAttribute("font-family", "Arial, sans-serif");
  footer.setAttribute("font-size", String(FOOTER_STYLE.size * units));
  footer.setAttribute("fill", FOOTER_STYLE.color);
  for (const item of layout.labels) {
    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", String((item.x + (item.align === "right" ? item.width : 0)) * units));
    label.setAttribute("y", String((placement.baseline - (layout.rows - 1 - item.row) * FOOTER_STYLE.leading) * units));
    label.setAttribute("text-anchor", item.align === "right" ? "end" : "start");
    label.textContent = item.text;
    footer.append(label);
  }
  if (layout.mark) {
    const mark = layout.mark;
    const group = document.createElementNS(ns, "g");
    group.setAttribute("class", "nota-export-mark");
    group.setAttribute("transform", `translate(${mark.x * units} ${(placement.baseline - (layout.rows - 1 - mark.row) * FOOTER_STYLE.leading - mark.height * 0.85) * units}) scale(${units})`);
    for (const shape of notaMarkPaths(mark.height)) {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", shape.segs.map(segment => `${segment.op}${segment.pts.join(" ")}`).join(" "));
      path.setAttribute("fill", shape.fill ? FOOTER_STYLE.color : "none");
      if (shape.strokeWidth) {
        path.setAttribute("stroke", FOOTER_STYLE.color);
        path.setAttribute("stroke-width", String(shape.strokeWidth));
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
      }
      group.append(path);
    }
    footer.append(group);
  }
  svg.append(footer);
  return svg;
}
