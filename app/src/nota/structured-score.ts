import type { ScoreDoc } from "../model/doc";
import { AccidentalCarry, continuesMeasure } from "../model/jianpu";
import { midiOfPitch } from "../model/edit";
import { parseAbc } from "../j123/parse";
import { loadScoreDoc } from "../model/fromxml";
import { checkMeasureDurations } from "../model/beatcheck";

export interface ScoreEvent {
  midi: number | null;
  quarters: number;
  grace: boolean;
  tieStart: boolean;
  tieStop: boolean;
}
export interface ScoreReference {
  events: ScoreEvent[][];
  spans?: { type: string; start: string; end: string }[];
  structure: {
    measure: number;
    location: string;
    repeat?: string;
    times?: number;
    ending?: { numbers: number[]; type: string };
  }[];
}
export interface StructuredInput {
  text: string;
  format: "abc" | "musicxml";
  part?: number;
  title?: string;
  reference?: ScoreReference;
}
const q = (n: number) => Math.round(n * 1e8) / 1e8;

/** Validation-only snapshot. This is never a second persisted score model. */
export function scoreReference(doc: ScoreDoc): ScoreReference {
  const song = doc.songs[0],
    part = song.parts[0];
  let key = song.key ?? { fifths: 0 },
    carry = new AccidentalCarry(),
    graceCarry: AccidentalCarry | undefined,
    divisions = 48;
  const positions = new Map<number, { start: string; end: string }>();
  const result: ScoreReference = {
    events: part.measures.map((m, i) => {
      if (m.attrs?.key) key = m.attrs.key;
      if (m.attrs?.divisions) divisions = m.attrs.divisions;
      if (!continuesMeasure(part.measures[i - 1], m)) {
        carry = new AccidentalCarry();
        graceCarry = undefined;
      }
      let at = 0;
      return m.elements.flatMap((e) => {
        if (e.kind !== "chord") return [];
        if (e.notes.length > 1 || e.voice > 1)
          throw new Error("请选取单旋律声部；暂不自动提取和弦或重叠声部。");
        const n = e.notes[0];
        if (!e.grace) graceCarry = undefined;
        const activeCarry = e.grace ? graceCarry ??= carry.fork() : carry;
        const p = n?.pitch ?? (n?.degree ? activeCarry.pitch(n.degree, key) : null);
        // MusicXML divisions already include tuplets; the 123 model uses nominal duration.
        const factor =
          doc.sourceFormat !== "musicxml" && e.duration.timeMod
            ? e.duration.timeMod.normal / e.duration.timeMod.actual
            : 1;
        const duration = e.grace
          ? 0
          : q((e.duration.divisions / divisions) * factor);
        positions.set(e.id, {
          start: `${i}:${q(at)}`,
          end: `${i}:${q(at + duration)}`,
        });
        at += duration;
        return [
          {
            midi: p ? midiOfPitch(p) : null,
            quarters: duration,
            grace: !!e.grace,
            tieStart: !!n?.tie?.start,
            tieStop: !!n?.tie?.stop,
          },
        ];
      });
    }),
    structure: part.measures.flatMap((m, i) =>
      (m.barlines ?? [])
        .filter((b) => b.repeat || b.ending)
        .map((b) => ({
          measure: i + 1,
          location: b.location,
          ...(b.repeat ? { repeat: b.repeat } : {}),
          ...(b.repeatTimes ? { times: b.repeatTimes } : {}),
          ...(b.ending
            ? { ending: { numbers: b.ending.numbers, type: b.ending.type } }
            : {}),
        })),
    ),
  };
  result.events = result.events.map(canonicalRests);
  result.spans = song.marks
    .filter((m) => m.type === "slur")
    .map((m) => ({
      type: m.type,
      start: positions.get(m.start)?.start ?? "?",
      end: positions.get(m.end)?.end ?? "?",
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return result;
}

export function canonicalRests(events: ScoreEvent[]): ScoreEvent[] {
  const out: ScoreEvent[] = [];
  for (const event of events) {
    const prev = out[out.length - 1];
    if (
      event.midi === null &&
      !event.grace &&
      prev?.midi === null &&
      !prev.grace
    )
      prev.quarters = q(prev.quarters + event.quarters);
    else out.push({ ...event });
  }
  return out;
}

export function compareReference(
  a: ScoreReference,
  b: ScoreReference,
): string[] {
  const errors: string[] = [];
  for (let i = 0; i < Math.max(a.events.length, b.events.length); i++) {
    if (JSON.stringify(a.events[i]) !== JSON.stringify(b.events[i]))
      errors.push(`第 ${i + 1} 小节的音高、八度、时值或起音/延音不同`);
  }
  if (a.spans && JSON.stringify(a.spans) !== JSON.stringify(b.spans))
    errors.push("连线端点不同");
  if (JSON.stringify(a.structure) !== JSON.stringify(b.structure))
    errors.push("反复或房号结构不同");
  return errors;
}

/** Retain native supported source formats; do not lose ties/grace slurs in an intermediate conversion. */
export function prepareStructuredScore(input: StructuredInput) {
  const doc =
    input.format === "abc" ? parseAbc(input.text) : loadScoreDoc(input.text);
  if (doc.diagnostics.length)
    throw new Error(`来源有解析诊断：${doc.diagnostics[0].message}`);
  if (doc.songs.length !== 1) throw new Error("请选取一首曲子。");
  const song = doc.songs[0];
  const partIndex = input.part ?? 0;
  if (!song.parts[partIndex]) throw new Error("所选声部不存在。");
  const selected = song.parts[partIndex];
  if (song.parts.length !== 1)
    throw new Error("请先选择 MusicXML 的旋律声部。");
  if (selected.measures.some((m) => m.attrs?.transpose))
    throw new Error("暂不自动导入移调乐器，请先明确实际音高。");
  // Lyrics are optional in the MVP. Keep the original file; import melody only.
  song.parts = [selected];
  const selectedIds = new Set(
    selected.measures.flatMap((m) => m.elements.map((e) => e.id)),
  );
  song.marks = song.marks.filter(
    (m) => selectedIds.has(m.start) && selectedIds.has(m.end),
  );
  if (input.format === "abc")
    for (const m of selected.measures)
      for (const e of m.elements) if (e.kind === "chord") delete e.lyrics;
  if (input.title) song.work.title = input.title;
  const before = scoreReference(doc);
  const text = input.text;
  const parsed =
    input.format === "musicxml" ? loadScoreDoc(text) : parseAbc(text);
  const after = scoreReference(parsed);
  const issues = [
    ...parsed.diagnostics.map((d) => d.message),
    ...compareReference(before, after),
  ];
  const beats = checkMeasureDurations(parsed);
  issues.push(
    ...beats.map(
      (b) => `第 ${b.measureIndex + 1} 小节拍数 ${b.got}，应为 ${b.want}`,
    ),
  );
  if (input.reference) issues.push(...compareReference(input.reference, after));
  if (issues.length)
    throw new Error(
      `未通过导入校验：${[...new Set(issues)].slice(0, 8).join("；")}`,
    );
  if (!after.events.some((m) => m.some((e) => e.midi !== null)))
    throw new Error("没有找到可导入的旋律音符。");
  return {
    text,
    format: input.format,
    title: song.work.title ?? "未命名曲谱",
    measures: after.events.length,
    notes: after.events.flat().filter((e) => e.midi !== null).length,
    part: selected.name ?? `声部 ${partIndex + 1}`,
    sourceCompared: !!input.reference,
    scope:
      input.format === "musicxml"
        ? "原生 MusicXML 旋律声部，保留原调、音区、歌词与连线；不导入伴奏"
        : "单旋律，保留原调与音区；不导入歌词和伴奏",
    reference: after,
  };
}
