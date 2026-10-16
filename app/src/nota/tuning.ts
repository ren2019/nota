import type { ScoreDoc } from '../model/doc';
import type { DocFormatId } from '../editor/formats';
import { convertPracticeText, type ConversionMode } from './convert';
import type { JianpuAccidentalMode } from './jianpu-output';
import { assertLossless123 } from './text-output';

/** A notation snapshot, not another pitch model. Context protects original-image/session edits too. */
export interface TuningDraft { key:string; format:DocFormatId; text:string; context:string }
export interface TuningChange { before:TuningDraft; after:TuningDraft }
export function prepareTuning(before:TuningDraft, doc:ScoreDoc, source123:string, target:number, mode:ConversionMode, accidentals:JianpuAccidentalMode) {
  if(doc.songs.length !== 1 || doc.songs[0]?.parts.length !== 1 || doc.songs[0].parts[0]!.measures.some(measure => measure.elements.some(element => element.kind === 'chord' && (element.notes.length > 1 || element.voice > 1)))) throw new Error('当前先支持单首、单声部、单旋律谱，请先取出主旋律。');
  if(!before.text || !source123) throw new Error('这份乐谱暂时无法转换，请先核对原稿。');
  assertLossless123(doc,source123);
  return convertPracticeText(source123,target,mode,accidentals);
}
export function canRestoreTuning(change:TuningChange | null, current:TuningDraft):boolean {
  return !!change && current.key === change.after.key && current.format === change.after.format && current.text === change.after.text && current.context === change.after.context;
}
export function restoreTuning(change:TuningChange, current:TuningDraft):TuningDraft {
  if(!canRestoreTuning(change,current)) throw new Error('转换后的曲谱或原图已修改，不能用旧稿覆盖；请在专业编辑中使用撤销。');
  return change.before;
}
