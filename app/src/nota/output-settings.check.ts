import { readFooterOptions, writeFooterOptions, footerText, exportFooterContext } from "./export-footer";
import { loadPersistedSettings, savePersistedSettings } from "../editor/settings";

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
} });
const oldStyle = { print: [{ match: {}, set: { roles: { note: { size: 22 } }, page: { paper: "A4", margin: [30, 40, 30, 40] } } }] };
storage.set("dolce-render-settings", JSON.stringify({ practiceFontSize: "broken", styleLayers: oldStyle, jianpuAccidentals: "measure" }));
equal(loadPersistedSettings()?.practiceFontSize, null, "Invalid remembered practice size falls back to the current style");
equal(loadPersistedSettings()?.styleLayers, oldStyle, "Invalid practice size preserves arbitrary 22pt font, paper and margins");
equal(loadPersistedSettings()?.jianpuAccidentals, "measure", "Practice size validation preserves accidental mode");
for (const size of [16, 20, 24]) {
  savePersistedSettings({ ...loadPersistedSettings(), practiceFontSize: size });
  equal(loadPersistedSettings()?.practiceFontSize, size, "Explicit practice choice survives reopening");
  equal(loadPersistedSettings()?.styleLayers, oldStyle, "Saving a choice preserves existing style");
}
storage.set("dolce-render-settings", JSON.stringify({ styleLayers: oldStyle }));
equal(loadPersistedSettings()?.practiceFontSize, null, "Old settings follow the existing arbitrary font size until a preset is explicitly selected");
equal(loadPersistedSettings()?.styleLayers, oldStyle, "Old settings migrate without replacing font, paper or margins");
// Existing stored footer choices remain the only source used by both settings
// entries and all exporters. Drafts are isolated until a dialog confirms them.
storage.set("nota.exportFooter.v1", '{"brand":false,"date":true,"pageNumbers":false}');
const draft = readFooterOptions();
draft.brand = true;
equal(readFooterOptions(), { brand: false, date: true, pageNumbers: false }, "Canceling a footer draft leaves old saved choices intact");
writeFooterOptions(draft);
equal(readFooterOptions(), { brand: true, date: true, pageNumbers: false }, "Confirmed choices are visible to either entry when reopened");
equal(footerText({ ...exportFooterContext(), date: "2026-10-16" }, 1, 3), { left: "Typeset with Nota · 2026-10-16", right: "" }, "Export reads the same saved footer choices");
equal(loadPersistedSettings()?.styleLayers, oldStyle, "Footer changes preserve practice style and paper");
storage.set("nota.exportFooter.v1", "broken");
equal(readFooterOptions(), { brand: true, date: true, pageNumbers: true }, "Malformed footer state keeps existing defaults");
console.log("Output settings checks passed.");
