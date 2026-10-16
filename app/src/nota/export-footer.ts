import { measureGlyphText } from "../common/measure";
/** Shared export-only branding. Never written into the score or its layout. */
export const NOTA_NAME = "Nota";
export const NOTA_SLOGAN = "A simple way to make sheet music.";
export const FOOTER_BRAND = `Typeset with ${NOTA_NAME}`;
export const FOOTER_STYLE = { size: 7.5, color: "#888888", margin: 24, bottom: 18, gap: 8, leading: 10, columnGap: 16 } as const;
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

export interface FooterContext { options: FooterOptions; date: string; source?: string }
export function exportFooterContext(): FooterContext {
  return { options: readFooterOptions(), date: localExportDate() };
}

export function footerText(context: FooterContext, index: number, count: number, continuous = false): { left: string; right: string } {
  return {
    left: context.source?.trim() ?? "",
    right: [context.options.brand ? `${FOOTER_BRAND}\n${NOTA_SLOGAN}` : "",
      [context.options.date ? context.date : "", context.options.pageNumbers && !continuous && count > 1 ? `${index + 1} / ${count}` : ""].filter(Boolean).join(" · ")].filter(Boolean).join("\n"),
  };
}

export interface FooterLabel { text: string; x: number; width: number; align: "left" | "right"; row: number }
/** Physical-point layout reused by every page exporter. Text measurement is the
 * only browser boundary; it uses the same font as the exported labels. */
export function layoutFooter(context: FooterContext, index: number, count: number, continuous: boolean, width: number,
  measure: (text: string) => number = text => measureGlyphText(text, "Arial, sans-serif", FOOTER_STYLE.size).width): { labels: FooterLabel[]; rows: number } {
  const text = footerText(context, index, count, continuous);
  const inner = Math.max(1, width - 2 * FOOTER_STYLE.margin);
  const both = !!(text.left && text.right);
  const column = both ? Math.max(1, (inner - FOOTER_STYLE.columnGap) / 2) : inner;
  function wrap(value: string): string[] {
    if (!value) return [];
    return value.split(/\r?\n/).flatMap(paragraph => {
      const lines: string[] = [];
      let line = "";
      for (const ch of paragraph) {
        if (line && measure(line + ch) > column) { lines.push(line.trimEnd()); line = ""; }
        line += ch;
      }
      if (line.trim()) lines.push(line.trimEnd());
      return lines;
    });
  }
  const left = wrap(text.left), right = wrap(text.right);
  const rows = Math.max(left.length, right.length);
  const labels: FooterLabel[] = [];
  for (const [lines, align] of [[left, "left"], [right, "right"]] as const) for (const [i, value] of lines.entries()) labels.push({
    text: value, align, x: align === "left" ? FOOTER_STYLE.margin : width - FOOTER_STYLE.margin - column,
    width: column, row: rows - lines.length + i,
  });
  return { labels, rows };
}

/** If a custom zero-margin page is full, fit the export as a whole without
 * moving a single note or changing its pagination. Long images can grow. */
export function footerPlacement(height: number, contentBottom: number, continuous: boolean, enabled: boolean, rows = 1) {
  if (!enabled) return { height, baseline: 0, scale: 1 };
  const band = FOOTER_STYLE.bottom + FOOTER_STYLE.size + FOOTER_STYLE.gap + Math.max(0, rows - 1) * FOOTER_STYLE.leading;
  const outputHeight = continuous ? Math.max(height, contentBottom + band) : height;
  return {
    height: outputHeight,
    baseline: outputHeight - FOOTER_STYLE.bottom,
    scale: contentBottom > 0 ? Math.min(1, (outputHeight - band) / contentBottom) : 1,
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
  const layout = layoutFooter(context, index, count, continuous, size.w);
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
  svg.append(footer);
  return svg;
}
