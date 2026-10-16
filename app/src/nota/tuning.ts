import { t } from '../i18n';
import type { ScoreDoc } from '../model/doc';
import type { DocFormatId } from '../editor/formats';
import { convertPracticeText, type ConversionMode } from './convert';
import type { JianpuAccidentalMode } from './jianpu-output';
import { assertLossless123 } from './text-output';

/** A notation snapshot, not another pitch model. Context protects original-image/session edits too. */
export interface TuningDraft { key:string; format:DocFormatId; text:string; context:string }
export interface TuningChange { before:TuningDraft; after:TuningDraft }
export function prepareTuning(before:TuningDraft, doc:ScoreDoc, source123:string, target:number, mode:ConversionMode, accidentals:JianpuAccidentalMode) {
  if(doc.songs.length !== 1 || doc.songs[0]?.parts.length !== 1 || doc.songs[0].parts[0]!.measures.some(measure => measure.elements.some(element => element.kind === 'chord' && (element.notes.length > 1 || element.voice > 1)))) throw new Error(t("nota.ia.currentlySupportsOneSongOne"));
  if(!before.text || !source123) throw new Error(t("nota.ia.thisScoreCannotBeConverted"));
  assertLossless123(doc,source123);
  return convertPracticeText(source123,target,mode,accidentals);
}
export function canRestoreTuning(change:TuningChange | null, current:TuningDraft):boolean {
  return !!change && current.key === change.after.key && current.format === change.after.format && current.text === change.after.text && current.context === change.after.context;
}
export function restoreTuning(change:TuningChange, current:TuningDraft):TuningDraft {
  if(!canRestoreTuning(change,current)) throw new Error(t("nota.ia.theScoreOrOriginalImages"));
  return change.before;
}
