import { t } from "../i18n";
import type { FooterOptions } from "./export-footer";

/** Both settings entries edit a draft; only their confirm action persists it. */
export function footerControls(options: FooterOptions): HTMLDivElement {
  const body = document.createElement("div");
  body.style.cssText = "display:grid;gap:12px;margin:12px 0";
  for (const [key, text] of [
    ["brand", t("settings.footer.brand")],
    ["date", t("settings.footer.date")],
    ["pageNumbers", t("settings.footer.pageNumbers")],
  ] as const) {
    const label = document.createElement("label");
    label.style.cssText = "display:flex;gap:8px;align-items:center;min-height:40px";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = options[key];
    input.onchange = () => { options[key] = input.checked; };
    label.append(input, text);
    body.append(label);
  }
  return body;
}
