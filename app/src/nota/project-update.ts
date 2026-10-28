import { ChangeSet } from '@codemirror/state';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { unpackProject } from '../editor/omrproject';
import { mapOmrMeta } from '../editor/omr-mapping';
import { metaFrom123 } from '../omr/meta';
import type { JpwMeta, JpwRange } from '../omrkit/types';

interface ProjectRecord { text: string; format: string; project?: string }
interface TextEdit { from: number; to: number; insert: string }
const problem = (message: string, source?: { offset: number; length: number }) => Object.assign(new Error(message), { code: 'project_mapping', source });
const decode = (project: string) => Uint8Array.from(atob(project), value => value.charCodeAt(0));
const encode = (bytes: Uint8Array) => {
  let result = '';
  for (let start = 0; start < bytes.length; start += 32768) result += String.fromCharCode(...bytes.subarray(start, start + 32768));
  return btoa(result);
};
const reviver = (_key: string, value: unknown): unknown => value && typeof value === 'object' && Object.keys(value).length === 1 && '__map' in value
  ? new Map((value as { __map: [number, JpwRange][] }).__map) : value;
const replacer = (_key: string, value: unknown): unknown => value instanceof Map ? { __map: [...value] } : value;
const equalRange = (a: JpwRange | undefined, b: JpwRange | undefined) => a && b && a.from === b.from && a.to === b.to;

/** Match every existing image anchor to a parsed token, never rely on the UI's ordinal fallback. */
function validateMeta(meta: JpwMeta, text: string, count: number) {
  const expected = metaFrom123(text);
  const valid = (range: JpwRange) => Number.isSafeInteger(range?.from) && Number.isSafeInteger(range?.to) && range.from >= 0 && range.to > range.from && range.to <= text.length;
  if (!Array.isArray(meta.noteRanges) || meta.noteRanges.length !== count || expected.noteRanges.length !== count ||
      !Array.isArray(meta.lyricRanges) || meta.lyricRanges.length !== count || !Array.isArray(meta.authorRanges)) throw problem('原图音符数与谱文或点选映射不一致，不能安全同步。');
  for (let index = 0; index < count; index++) {
    const range = meta.noteRanges[index]!;
    if (!valid(range) || !equalRange(range, expected.noteRanges[index])) throw problem(`原图第 ${index + 1} 个音符未能准确对应谱文，未保存。`, { offset: range?.from ?? 0, length: Math.max(0, (range?.to ?? 0) - (range?.from ?? 0)) });
    const lyrics = meta.lyricRanges[index];
    if (!(lyrics instanceof Map)) throw problem(`原图第 ${index + 1} 个音符的歌词映射损坏。`);
    for (const [verse, lyric] of lyrics) if (!valid(lyric) || !equalRange(lyric, expected.lyricRanges[index]?.get(verse))) throw problem(`原图第 ${index + 1} 个音符的歌词定位不能安全同步。`);
  }
  if (meta.titleRange && (!valid(meta.titleRange) || !equalRange(meta.titleRange, expected.titleRange))) throw problem('原图标题定位不能安全同步。');
  for (const author of meta.authorRanges) if (!valid(author.range) || !expected.authorRanges.some(item => equalRange(item.range, author.range))) throw problem('原图作者定位不能安全同步。');
}

function textChanges(text: string, next: string, input: unknown) {
  if (!Array.isArray(input) || input.length === 0) throw problem('修改带原图的谱文需要 edits 局部编辑范围及最终 text；不能用整篇替换迁移音符定位。');
  let end = 0;
  for (const edit of input as TextEdit[]) {
    if (!edit || !Number.isSafeInteger(edit.from) || !Number.isSafeInteger(edit.to) || typeof edit.insert !== 'string' || edit.from < end || edit.from < 0 || edit.to < edit.from || edit.to > text.length) throw problem('edits 必须按原文 UTF-16 坐标排序、互不重叠且不越界。');
    end = edit.to;
  }
  const changes = ChangeSet.of(input as TextEdit[], text.length);
  let applied = '', cursor = 0;
  for (const edit of input as TextEdit[]) { applied += text.slice(cursor, edit.from) + edit.insert; cursor = edit.to; }
  applied += text.slice(cursor);
  if (applied !== next) throw problem('edits 生成的谱文与最终 text 不一致，未保存。');
  return changes;
}

/** Keep original ZIP entry bytes, including unknown content; rewrite only current text and known mappings. */
export function synchronizeProject(previous: ProjectRecord, candidate: ProjectRecord, edits?: unknown): string {
  if (!previous.project || candidate.project !== previous.project) throw problem('原图项目不能在远程更新时被替换或剥除；请保留完整原件。');
  if (candidate.format !== previous.format) throw problem('带原图的远程更新暂不支持切换谱文格式。');
  if (candidate.text === previous.text) {
    if (edits !== undefined && !(Array.isArray(edits) && edits.length === 0)) textChanges(previous.text, candidate.text, edits);
    return previous.project;
  }
  try {
    const bytes = decode(previous.project), files = unzipSync(bytes), project = unpackProject(bytes);
    if (project.kind !== 'jianpu' || project.docFormat !== '123' || previous.format !== '123' || !project.jianpu?.meta) throw problem('此原图项目尚未接通可靠的远程点选同步；目前仅支持有完整映射的简谱 123 项目。');
    const count = project.jianpu.score.rows.reduce((total, row) => total + row.nums.length, 0);
    if (!files['result/meta.json'] || !files['doc.txt'] || !project.sources.length || !project.jianpu.bin.data.length) throw problem('原图项目缺少原件、谱文、二值图或点选映射。');
    const meta = JSON.parse(strFromU8(files['result/meta.json']), reviver) as JpwMeta;
    validateMeta(meta, project.text, count);
    let current = meta;
    if (project.text !== previous.text) {
      const prefix = previous.text.endsWith(project.text) ? previous.text.slice(0, previous.text.length - project.text.length) : '';
      if (!project.text || !/^(?:%(?!%)[^\r\n]*\r?\n|[ \t]*\r?\n)+$/.test(prefix)) throw problem('项目内谱文与曲谱库正文不一致，无法安全同步。');
      current = mapOmrMeta(current, ChangeSet.of({ from: 0, insert: prefix }, project.text.length));
      validateMeta(current, previous.text, count);
    }
    const mapped = mapOmrMeta(current, textChanges(previous.text, candidate.text, edits));
    mapped.authorRanges = mapped.authorRanges.map(author => ({ ...author, text: candidate.text.slice(author.range.from, author.range.to) }));
    validateMeta(mapped, candidate.text, count);
    files['doc.txt'] = strToU8(candidate.text);
    files['result/meta.json'] = strToU8(JSON.stringify(mapped, replacer));
    // Stable output allows preflight hashes to identify the exact later write and lost-response readback.
    const archive = Object.fromEntries(Object.entries(files).map(([name, content]) => [name, [content, { mtime: new Date(1980, 0, 1) }] as [Uint8Array, { mtime: Date }]]));
    return encode(zipSync(archive, { level: 6 }));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'project_mapping') throw error;
    throw problem('原图项目损坏或映射格式不受支持，原记录已保留。');
  }
}
