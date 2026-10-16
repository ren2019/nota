import { parse123 } from "../j123/parse";
import { emit123 } from "../j123/emit";
import { projectScoreFooter, scoreFooterSource } from "./score-footer-source";
import { DEFAULT_FOOTER, footerText, footerPlacement, localExportDate, layoutFooter } from "./export-footer";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Footer check: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
const context = { options: { ...DEFAULT_FOOTER }, date: "2026-10-16" };
equal(footerText(context, 0, 1), { left: "", right: "Typeset with Nota\nA simple way to make sheet music.\n2026-10-16" });
equal(footerText(context, 1, 2), { left: "", right: "Typeset with Nota\nA simple way to make sheet music.\n2026-10-16 · 2 / 2" });
equal(footerText(context, 0, 3, true).right, "Typeset with Nota\nA simple way to make sheet music.\n2026-10-16");
for (const brand of [false, true]) for (const date of [false, true]) for (const pageNumbers of [false, true]) {
  const result = footerText({ ...context, options: { brand, date, pageNumbers } }, 0, 2);
  equal(result.left, "");
  equal(result.right, [brand ? "Typeset with Nota\nA simple way to make sheet music." : "", [date ? "2026-10-16" : "", pageNumbers ? "1 / 2" : ""].filter(Boolean).join(" · ")].filter(Boolean).join("\n"));
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
const wrapped = layoutFooter({ ...context, source: "一二三四五六七八九十" }, 0, 2, false, 96, s => [...s].length * 7.5);
if (!wrapped.labels.some(l => l.align === "left") || !wrapped.labels.some(l => l.align === "right")) throw new Error("Both footer columns must exist");
for (const l of wrapped.labels) if ([...l.text].length * 7.5 > l.width) throw new Error("Narrow footer must wrap within its column");
const sourceOnly = layoutFooter({ ...context, source: "来源保留", options: { brand: false, date: false, pageNumbers: false } }, 0, 1, false, 595, s => s.length * 7.5);
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
