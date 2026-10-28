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

export const SUBMISSION_FORMATS = ['123', 'abc', 'jcx', 'pu', 'jly', 'jpwabc', 'musicxml'];
export interface SubmissionDiagnostic { severity: 'error' | 'warning'; code: string; message: string; source?: SourceSpan; measure?: number; song?: number; part?: number }
export interface SubmissionInput { title: string; format: string; text: string; project?: string; source?: Record<string, unknown> }

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

export function checkSubmission(input: SubmissionInput) {
  const diagnostics: SubmissionDiagnostic[] = [];
  const error = (code: string, message: string) => diagnostics.push({ severity: 'error', code, message });
  const finish = (notes = 0, measures = 0) => ({
    ok: !diagnostics.some(d => d.severity === 'error'), diagnostics, supportedFormats: SUBMISSION_FORMATS,
    counts: { notes, measures },
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
  if (measures.length) {
    diagnostics.push(...checkMeasureDurations(doc).map(issue => ({ severity: 'error' as const, code: 'measure_duration',
      message: `第 ${issue.measureIndex + 1} 小节时值为 ${issue.got} 拍，应为 ${issue.want} 拍。`,
      measure: issue.measureIndex + 1, song: issue.songIndex + 1, part: issue.partIndex + 1, source: issue.source })));
  }
  return finish(notes, measures.length);
}
