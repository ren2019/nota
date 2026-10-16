import { openModal } from "../editor/dialogs";
import { t } from "../i18n";
import { footerControls } from "./footer-controls";
import { readFooterOptions, writeFooterOptions } from "./export-footer";

export function showFooterSettings(): void {
  const options = readFooterOptions();
  const body = footerControls(options);
  const save = document.createElement("button");
  save.textContent = t("settings.footer.save");
  const cancel = document.createElement("button");
  cancel.textContent = t("dlg.cancel");
  const { close } = openModal({ title: t("settings.footer.title"), body: [body], footer: [cancel, save] });
  cancel.onclick = close;
  save.onclick = () => { writeFooterOptions(options); close(); };
}
