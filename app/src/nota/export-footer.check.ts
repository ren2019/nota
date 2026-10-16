import { DEFAULT_FOOTER, footerText, footerPlacement, localExportDate } from "./export-footer";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Footer check: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
const context = { options: { ...DEFAULT_FOOTER }, date: "2026-10-16" };
equal(footerText(context, 0, 1), { left: "Typeset with Nota · 2026-10-16", right: "" });
equal(footerText(context, 1, 2), { left: "Typeset with Nota · 2026-10-16", right: "2 / 2" });
equal(footerText(context, 0, 3, true).right, "");
for (const brand of [false, true]) for (const date of [false, true]) for (const pageNumbers of [false, true]) {
  const result = footerText({ ...context, options: { brand, date, pageNumbers } }, 0, 2);
  equal(result.left, brand ? `Typeset with Nota${date ? " · 2026-10-16" : ""}` : date ? "2026-10-16" : "");
  equal(result.right, pageNumbers ? "1 / 2" : "");
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
