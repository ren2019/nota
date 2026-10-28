import type { JpwMeta, JpwRange } from "../omrkit/types";

/** 网页编辑和远程更新共用同一套 CodeMirror 区间迁移规则。 */
export function mapOmrMeta(meta: JpwMeta, changes: { mapPos(pos: number, assoc?: number): number }): JpwMeta {
  const range = (value: JpwRange): JpwRange => ({ ...value, from: changes.mapPos(value.from, 1), to: changes.mapPos(value.to, -1) });
  return {
    ...meta,
    noteRanges: meta.noteRanges.map(range),
    lyricRanges: meta.lyricRanges.map(items => new Map([...items].map(([verse, value]) => [verse, range(value)]))),
    titleRange: meta.titleRange ? range(meta.titleRange) : undefined,
    authorRanges: meta.authorRanges.map(author => ({ ...author, range: range(author.range) })),
  };
}
