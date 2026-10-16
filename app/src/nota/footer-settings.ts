import { openModal } from "../editor/dialogs";
import { readFooterOptions, writeFooterOptions, type FooterOptions } from "./export-footer";

export function showFooterSettings(): void {
  const options = readFooterOptions();
  const body = document.createElement("div");
  body.style.cssText = "display:grid;gap:12px;margin:12px 0";
  for (const [key, text] of [["brand", "显示品牌署名"], ["date", "显示生成日期"], ["pageNumbers", "显示页码（仅多页）"]] as const) {
    const label = document.createElement("label");
    label.style.cssText = "display:flex;gap:8px;align-items:center";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = options[key];
    input.onchange = () => { options[key as keyof FooterOptions] = input.checked; };
    label.append(input, text);
    body.append(label);
  }
  const save = document.createElement("button");
  save.textContent = "保存设置";
  const cancel = document.createElement("button");
  cancel.textContent = "取消";
  const { close } = openModal({ title: "导出页脚", body: [body], footer: [cancel, save] });
  cancel.onclick = close;
  save.onclick = () => { writeFooterOptions(options); close(); };
}
