import { parse123 } from "../j123/parse";
import { emit123 } from "../j123/emit";
import { projectScoreFooter, scoreFooterSource } from "./score-footer-source";
import { DEFAULT_FOOTER, footerText, footerPlacement, localExportDate, layoutFooter } from "./export-footer";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Footer check: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
const context = { options: { ...DEFAULT_FOOTER }, date: "2026-10-16" };
equal(footerText(context, 0, 1), { left: "", right: "2026-10-16", brand: "Typeset with Nota · A simple way to make sheet music." });
equal(footerText(context, 1, 2), { left: "", right: "2026-10-16 · 2 / 2", brand: "Typeset with Nota · A simple way to make sheet music." });
equal(footerText(context, 0, 3, true).right, "2026-10-16");
for (const brand of [false, true]) for (const date of [false, true]) for (const pageNumbers of [false, true]) {
  const result = footerText({ ...context, options: { brand, date, pageNumbers } }, 0, 2);
  equal(result.left, "");
  equal(result.right, [date ? "2026-10-16" : "", pageNumbers ? "1 / 2" : ""].filter(Boolean).join(" · "));
  equal(result.brand, brand ? "Typeset with Nota · A simple way to make sheet music." : "");
}
equal(footerPlacement(842, 800, false, true), { height: 842, baseline: 824, scale: 1 });
const full = footerPlacement(842, 842, false, true);
if (full.height !== 842 || full.scale * 842 >= full.baseline - 7.5) throw new Error("Footer overlaps a full page");
const long = footerPlacement(420, 410, true, true);
if (long.height <= 420 || long.scale !== 1) throw new Error("Long image must grow without repagination");
equal(footerPlacement(842, 842, false, false), { height: 842, baseline: 0, scale: 1 });
// Crossing midnight in local time must not take the date from UTC.
equal(localExportDate(new Date(2026, 9, 16, 0, 5)), "2026-10-16");
equal(localExportDate(new Date(2026, 0, 1, 23, 59)), "2026-01-01");
console.log(`Export footer checks passed (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`);

// Physical footer columns share a measured layout across SVG and PPTX.
const wrapped = layoutFooter({ ...context, source: "一二三四五六七八九十" }, 0, 2, false, 96, 842, s => [...s].length * 7.5);
if (!wrapped.labels.some(l => l.align === "left") || !wrapped.labels.some(l => l.align === "right")) throw new Error("Both footer columns must exist");
for (const l of wrapped.labels) if ([...l.text].length * 7.5 > l.width) throw new Error("Narrow footer must wrap within its column");
const sourceOnly = layoutFooter({ ...context, source: "来源保留", options: { brand: false, date: false, pageNumbers: false } }, 0, 1, false, 595, 842, s => s.length * 7.5);
equal(sourceOnly.labels.map(l => l.text), ["来源保留"]);
const wrappedPlacement = footerPlacement(842, 800, false, true, wrapped.rows);
if (wrappedPlacement.scale * 800 >= wrappedPlacement.baseline - (wrapped.rows - 1) * 10 - 7.5) throw new Error("Multiline footer overlaps music");

// Source is explicit metadata, not a guess based on ordinary subtitles/authors.
const sourceText = "T:测试曲\nT:普通副标题\nC:普通作者\nI:meta source 公开谱集 · 校对版\nK:1=C\nM:4/4\n1 2 3 4 |]";
const sourceDoc = parse123(sourceText);
equal(scoreFooterSource(sourceDoc.songs[0]!), "公开谱集 · 校对版");
equal(scoreFooterSource(parse123(emit123(sourceDoc)).songs[0]!), "公开谱集 · 校对版");
equal(projectScoreFooter(sourceDoc), sourceDoc);
const legacyDoc = parse123(sourceText.replace("普通副标题", "单段旋律 · 依 AirDrop 原图校正").replace("I:meta source 公开谱集 · 校对版\n", ""));
const legacyBefore = JSON.stringify(legacyDoc);
const displayed = projectScoreFooter(legacyDoc);
equal(displayed.songs[0]!.work.subtitles, []);
equal(displayed.songs[0]!.identification, legacyDoc.songs[0]!.identification);
equal(scoreFooterSource(legacyDoc.songs[0]!), "单段旋律 · 依 AirDrop 原图校正");
equal(JSON.stringify(legacyDoc), legacyBefore);
equal(displayed.songs[0]!.parts, legacyDoc.songs[0]!.parts);
equal(scoreFooterSource(parse123("T:无来源\nK:1=C\nM:4/4\n1 2 3 4 |]").songs[0]!), "");

// Fixed pages must abbreviate extreme source text instead of inverting music.
const hugeSource = "来源说明".repeat(1000);
const bounded = layoutFooter({ ...context, source: hugeSource }, 0, 2, false, 595, 842, s => [...s].length * 7.5);
const boundedPlacement = footerPlacement(842, 700, false, true, bounded.rows);
if (boundedPlacement.scale <= 0 || bounded.rows > 20) throw new Error("Extreme source must have a positive music scale and bounded footer height");
if (!bounded.labels.some(l => l.align === "left" && l.text.endsWith("…"))) throw new Error("Truncated source must be marked with an ellipsis");
const unbounded = layoutFooter({ ...context, source: hugeSource }, 0, 2, true, 595, 842, s => [...s].length * 7.5);
equal(unbounded.labels.filter(l => l.align === "left" && l.row < unbounded.mark!.row).map(l => l.text).join(""), hugeSource);
equal(footerPlacement(842, 700, true, true, unbounded.rows).scale, 1);
for (const width of [5, 48, 96, 595]) for (const height of [5, 20, 100, 842]) {
  const small = layoutFooter({ ...context, source: hugeSource }, 0, 2, false, width, height, s => [...s].length * 7.5);
  const placement = footerPlacement(height, height, false, small.rows > 0, small.rows);
  if (!(placement.scale > 0 && placement.scale <= 1)) throw new Error("Small page music scale must stay positive");
  for (const label of small.labels) {
    const top = placement.baseline - (small.rows - 1 - label.row) * 10 - 7.5;
    if (top < 0 || label.x < 0 || label.x + label.width > width || placement.baseline > height) throw new Error("Small page footer must stay within the physical page");
  }
}
const boundedBrandOff = layoutFooter({ ...context, source: hugeSource, options: { brand: false, date: false, pageNumbers: false } }, 0, 1, false, 595, 842, s => [...s].length * 7.5);
if (!boundedBrandOff.labels.length || !boundedBrandOff.labels[boundedBrandOff.labels.length - 1]!.text.endsWith("…")) throw new Error("Source stays visible and bounded with every optional brand item off");
if (!bounded.labels.filter(l => l.row >= bounded.mark!.row).map(l => l.text).join("\n").includes("A simple way to make sheet music.")) throw new Error("Normal paper must retain the complete official slogan");

const twoRow = layoutFooter({ ...context, source: "公开谱集" }, 0, 2, false, 595, 842, s => [...s].length * 7.5);
equal(twoRow.rows, 2);
equal(twoRow.labels.map(l => [l.text, l.row, l.align]), [["公开谱集", 0, "left"], ["2026-10-16 · 1 / 2", 0, "right"], ["Typeset with Nota · A simple way to make sheet music.", 1, "left"]]);
if (!twoRow.mark || twoRow.mark.row !== 1 || twoRow.mark.x !== twoRow.labels[0]!.x) throw new Error("Logo begins the second row aligned to the source edge");
const empty = layoutFooter({ ...context, options: { brand: false, date: false, pageNumbers: false } }, 0, 1, false, 595, 842);
equal(empty.rows, 0);
equal(empty.mark, undefined);

const brandOnly = layoutFooter({ ...context, options: { brand: true, date: false, pageNumbers: false } }, 0, 1, false, 595, 842, s => [...s].length * 7.5);
equal(brandOnly.rows, 1);
equal(brandOnly.mark?.row, 0);
for (const brand of [false, true]) for (const date of [false, true]) for (const pageNumbers of [false, true]) for (const hasSource of [false, true]) {
  const layout = layoutFooter({ ...context, source: hasSource ? "真实来源" : "", options: { brand, date, pageNumbers } }, 0, 2, false, 595, 842, s => [...s].length * 7.5);
  const information = hasSource || date || pageNumbers;
  equal(layout.rows, Number(information) + Number(brand));
  equal(!!layout.mark, brand);
  if (layout.mark) equal(layout.mark.row, Number(information));
}
for (const width of [5, 48, 96, 595]) for (const height of [5, 20, 100, 842]) {
  const layout = layoutFooter({ ...context, source: hugeSource }, 0, 2, false, width, height, s => [...s].length * 7.5);
  if (!layout.mark) continue;
  const placement = footerPlacement(height, height, false, true, layout.rows);
  const top = placement.baseline - (layout.rows - 1 - layout.mark.row) * 10 - layout.mark.height * 0.85;
  if (layout.mark.x < 0 || top < 0 || layout.mark.x + layout.mark.width > width || top + layout.mark.height > height) throw new Error("Small-page logo must remain inside the output page");
}
