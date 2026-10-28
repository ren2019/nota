import { parse123, parseAbc, parseJcx } from '../j123/parse';
import { parsePu, sniffDialect } from '../pu';
import { parseJly } from '../model/fromjly';
import { JpwFile } from '../jpword/jpwfile';
import { jpwToScoreDoc } from '../model/fromjpw';
import { loadScoreDoc } from '../model/fromxml';
import { checkMeasureDurations } from '../model/beatcheck';
import { unpackProject } from '../editor/omrproject';
import { unzipSync, strFromU8 } from 'fflate';
import type { ScoreDoc, SourceSpan } from '../model/doc';
import { scoreReference } from './structured-score';

export const SUBMISSION_FORMATS = ['123', 'abc', 'jcx', 'pu', 'jly', 'jpwabc', 'musicxml'];
export interface SubmissionDiagnostic { severity: 'error' | 'warning'; code: string; message: string; source?: SourceSpan; measure?: number; song?: number; part?: number }
export interface SubmissionInput { title: string; format: string; text: string; project?: string; source?: Record<string, unknown> }
export interface SubmissionOptions { previous?: SubmissionInput; intent?: { kind?: string; semitones?: number } }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const withoutSources = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutSources);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/source$/i.test(key)).map(([key, item]) => [key, withoutSources(item)]));
  return value;
};

/** Temporary comparison only. Source text and the existing ScoreDoc remain authoritative. */
function musicSnapshot(doc: ScoreDoc) {
  if (doc.songs.length !== 1 || doc.songs[0].parts.length !== 1) throw new Error('目前改动对照限一首、单旋律声部。');
  const song = doc.songs[0], part = song.parts[0];
  if (part.measures.some(m => m.elements.some(e => e.kind !== 'chord' || e.placeholder))) throw new Error('此谱包含暂未接通安全对照的占位元素。');
  const reference = scoreReference(doc);
  const ids = part.measures.flatMap(m => m.elements.map(e => e.id));
  const lyrics = part.measures.map(m => m.elements.map(e => withoutSources(e.lyrics ?? [])));
  const bars = part.measures.map(m => withoutSources(m.barlines ?? []));
  const meter = [song.time, song.extraTimes, ...part.measures.map(m => m.attrs?.time)];
  const marks = song.marks.map(({ source: _source, openSource: _open, closeSource: _close, start, end, ...mark }) => ({ ...mark, start: ids.indexOf(start), end: ids.indexOf(end) }));
  const playOrder = song.playOrder?.map(({ fromElement, toElement, ...pass }) => ({ ...pass, fromElement: fromElement === undefined ? undefined : ids.indexOf(fromElement), toElement: toElement === undefined ? undefined : ids.indexOf(toElement) }));
  return { reference, lyrics, bars, meter, marks, playOrder };
}

function changedMusic(before: ScoreDoc, after: ScoreDoc) {
  const a = musicSnapshot(before), b = musicSnapshot(after);
  const changedMeasures: { song: number; part: number; measure: number }[] = [];
  const pitchChanges: { song: number; part: number; measure: number; event: number; before: number | null; after: number | null }[] = [];
  const rhythm = (snapshot: typeof a) => snapshot.reference.events.map(events => events.map(({ quarters, grace, midi }) => ({ quarters, grace, rest: midi === null })));
  const ties = (snapshot: typeof a) => snapshot.reference.events.map(events => events.map(({ tieStart, tieStop }) => ({ tieStart, tieStop })));
  for (let m = 0; m < Math.max(a.reference.events.length, b.reference.events.length); m++) {
    const oldEvents = a.reference.events[m] ?? [], newEvents = b.reference.events[m] ?? [];
    if (!same([oldEvents, a.lyrics[m], a.bars[m], a.meter[m + 2]], [newEvents, b.lyrics[m], b.bars[m], b.meter[m + 2]])) changedMeasures.push({ song: 1, part: 1, measure: m + 1 });
    for (let e = 0; e < Math.max(oldEvents.length, newEvents.length); e++) {
      if (oldEvents[e]?.midi !== newEvents[e]?.midi) pitchChanges.push({ song: 1, part: 1, measure: m + 1, event: e + 1, before: oldEvents[e]?.midi ?? null, after: newEvents[e]?.midi ?? null });
    }
  }
  return { comparable: true, changedMeasures, pitchChanges, rhythmChanged: !same(rhythm(a), rhythm(b)), tiesChanged: !same(ties(a), ties(b)),
    structureChanged: !same([a.bars, a.meter, a.marks, a.playOrder, a.reference.spans], [b.bars, b.meter, b.marks, b.playOrder, b.reference.spans]), lyricsChanged: !same(a.lyrics, b.lyrics),
    pitchShift: (() => {
      const oldEvents = a.reference.events.flat(), newEvents = b.reference.events.flat();
      if (oldEvents.length !== newEvents.length) return null;
      const shifts = oldEvents.flatMap((event, i) => event.midi !== null && newEvents[i]?.midi !== null ? [newEvents[i].midi! - event.midi] : []);
      return shifts.length && shifts.every(shift => shift === shifts[0]) ? shifts[0] : null;
    })() };
}

/** Native parsers only: no conversion, source rewrite, or second persisted model. */
export function parseSubmission(input: Pick<SubmissionInput, 'format' | 'text'>): ScoreDoc {
  switch (input.format) {
    case '123': return parse123(input.text);
    case 'abc': return parseAbc(input.text);
    case 'jcx': return parseJcx(input.text);
    case 'pu': {
      if (!sniffDialect(input.text).dialect) throw new Error('无法确定文本谱方言。');
      return parsePu(input.text);
    }
    case 'jly': {
      const parsed = parseJly(input.text);
      if (parsed.unknown.length) throw new Error(`不支持的 jianpu-ly 内容：${parsed.unknown.join('、').slice(0, 160)}`);
      return parsed.doc;
    }
    case 'jpwabc': {
      const file = JpwFile.fromString(input.text);
      if (!file) throw new Error('无法解析 JPWABC。');
      return jpwToScoreDoc(file);
    }
    case 'musicxml': return loadScoreDoc(input.text);
    default: throw new Error('此格式尚未接通服务端检查。');
  }
}

export function checkSubmission(input: SubmissionInput, options: SubmissionOptions = {}) {
  const diagnostics: SubmissionDiagnostic[] = [];
  let changes: ReturnType<typeof changedMusic> | { comparable: false; reason: string } | undefined;
  const error = (code: string, message: string) => diagnostics.push({ severity: 'error', code, message });
  const finish = (notes = 0, measures = 0) => ({
    ok: !diagnostics.some(d => d.severity === 'error'), diagnostics, supportedFormats: SUBMISSION_FORMATS,
    counts: { notes, measures }, ...(changes ? { changes } : {}),
    scope: '已执行服务端原生解析、可用旋律与小节时值检查；未逐音对照可信原稿，未由人试听。',
  });
  if (!input || typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 120) error('title', '请提供不超过 120 字的曲名。');
  if (!SUBMISSION_FORMATS.includes(input?.format)) error('format', '不支持此谱文格式。');
  if (typeof input?.text !== 'string' || !input.text.trim()) error('text', '谱文不能为空。');
  if (diagnostics.length) return finish();
  if (input.project !== undefined) {
    try {
      if (typeof input.project !== 'string' || !input.project || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.project)) throw new Error();
      const bytes = Uint8Array.from(atob(input.project), c => c.charCodeAt(0));
      const files = unzipSync(bytes);
      const manifest = JSON.parse(strFromU8(files['manifest.json']));
      if (!Array.isArray(manifest.sources) || !manifest.sources.length || manifest.sources.some((s: {file: string}) => !files[s.file]?.length)) throw new Error();
      const project = unpackProject(bytes);
      const prefix = input.text.endsWith(project.text) ? input.text.slice(0, input.text.length - project.text.length) : '';
      const legacy = input.format === '123' && project.text.trim() && /^(?:%(?!%)[^\r\n]*\r?\n|[ \t]*\r?\n)+$/.test(prefix);
      if ((project.text !== input.text && !legacy) || project.docFormat !== input.format) throw new Error();
      if (manifest.kind === 'jianpu' && !project.jianpu) throw new Error();
    } catch { error('project', '原图项目损坏、缺少原件或与谱文格式/内容不一致，未保存。'); }
  }
  let doc: ScoreDoc;
  try { doc = parseSubmission(input); }
  catch (e) { error('parse', e instanceof Error ? e.message : '谱文解析失败。'); return finish(); }
  // Native parsers are tolerant for interactive editing. Unresolved diagnostics must not silently drop source content on submission.
  diagnostics.push(...doc.diagnostics.map(d => ({ ...d, severity: 'error' as const })));
  const measures = doc.songs.flatMap(s => s.parts.flatMap(p => p.measures));
  const notes = measures.flatMap(m => m.elements).flatMap(e => e.kind === 'chord' ? e.notes.filter(n => n.pitch || (n.degree && n.degree.number > 0)) : []).length;
  if (!notes) error('no_melody', '没有找到可用的旋律音符。');
  let previousDoc: ScoreDoc | undefined;
  if (options.previous) {
    try { previousDoc = parseSubmission(options.previous); }
    catch { error('previous_parse', '旧谱无法解析，无法安全核对本次修改。'); }
  }
  const pickups = previousDoc ? new Set(checkMeasureDurations(previousDoc, { pickup: () => false }).filter(i => i.measureIndex === 0 && i.got < i.want).map(i => `${i.songIndex}:${i.partIndex}`)) : undefined;
  if (measures.length) {
    diagnostics.push(...checkMeasureDurations(doc, pickups ? { pickup: (s, p) => pickups.has(`${s}:${p}`) } : {}).map(issue => ({ severity: 'error' as const, code: 'measure_duration',
      message: `第 ${issue.measureIndex + 1} 小节时值为 ${issue.got} 拍，应为 ${issue.want} 拍。`,
      measure: issue.measureIndex + 1, song: issue.songIndex + 1, part: issue.partIndex + 1, source: issue.source })));
  }
  if (options.intent !== undefined && (!options.intent || typeof options.intent !== 'object' || Array.isArray(options.intent) || !options.intent.kind)) error('intent', '请显式使用 intent.kind 声明修改意图。');
  const intent = options.intent?.kind ?? 'edit';
  if (!['edit', 'transpose', 'renotate'].includes(intent)) error('intent', '修改意图只支持 edit、transpose 或 renotate。');
  if (previousDoc) {
    try { changes = changedMusic(previousDoc, doc); }
    catch (e) {
      changes = { comparable: false, reason: e instanceof Error ? e.message : '无法完成音乐对照。' };
      // Metadata-only edits retain the exact score; other unsupported comparisons must be explicit.
      if (input.text !== options.previous?.text || input.format !== options.previous?.format || intent !== 'edit') error('comparison_unsupported', changes.reason);
    }
    if (changes.comparable && intent !== 'edit') {
      if (changes.rhythmChanged || changes.tiesChanged || changes.structureChanged || changes.lyricsChanged) error('conversion_structure', '转换改变了节奏、休止、连线、小节/反复结构或歌词。');
      if (intent === 'renotate' && changes.pitchChanges.length) error('renotate_pitch', '重新记谱必须保持每个音的实际音高和音区。');
      if (intent === 'transpose' && (!Number.isSafeInteger(options.intent?.semitones) || changes.pitchShift !== options.intent?.semitones)) error('transpose_interval', '实际移调必须让每个音按指定的统一半音数移动。');
    }
  } else if (intent !== 'edit') error('intent_baseline', '转换检查需要指定旧谱编号和修订版本。');
  return finish(notes, measures.length);
}

export { synchronizeProject } from './project-update';
