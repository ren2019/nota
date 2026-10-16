import type { ScoreDoc } from "../model/doc";
import { emit123 } from "../j123/emit";
import { projectJianpuOutput, type JianpuAccidentalMode } from "./jianpu-output";
import { parse123 } from "../j123/parse";
import { withPageMeta } from "../model/pagemeta";
import { compareReference, scoreReference } from "./structured-score";
import { t } from "../i18n";
import { planSave } from "../model/capability";

/** Keep the verified native-import guard on both conversion and text export. */
export function assertLossless123(doc: ScoreDoc, text: string): void {
  const losses = planSave(doc, "123");
  if (losses.length) throw new Error(t("nota.export.123.lossy", { reason: losses.map(loss => loss.name).join("、") }));
  if (doc.sourceFormat !== "abc" && doc.sourceFormat !== "musicxml") return;
  if (doc.songs.length !== 1 || doc.songs[0]!.parts.length !== 1) throw new Error(t("nota.export.123.single"));
  const differences = compareReference(scoreReference(doc), scoreReference(parse123(text)));
  if (differences.length) throw new Error(t("nota.export.123.lossy", { reason: differences[0] }));
}

/** Explicit text export; never writes back to the editor or source project. */
export function emitJianpu123(doc: ScoreDoc, mode: JianpuAccidentalMode): string {
  if (doc.diagnostics.some(d => d.severity === "error")) throw new Error(t("nota.export.123.parse"));
  const text = emit123(withPageMeta(doc));
  assertLossless123(doc, text);
  const output = emit123(projectJianpuOutput(parse123(text), mode));
  assertLossless123(doc, output);
  return output;
}
