import type { InlineItem, Key, Measure, ScoreDoc } from "../model/doc";
import { cloneWithSurface } from "../model/xmlsurface";
import { AccidentalCarry, continuesMeasure, topNote } from "../model/jianpu";

export type JianpuAccidentalMode = "explicit" | "measure";
export const DEFAULT_JIANPU_ACCIDENTALS: JianpuAccidentalMode = "explicit";

export const jianpuAccidentalMode = (value: unknown): JianpuAccidentalMode =>
  value === "measure" ? "measure" : DEFAULT_JIANPU_ACCIDENTALS;

interface CarryPair {
  input: AccidentalCarry;
  output: AccidentalCarry;
  allOutput: AccidentalCarry;
}

/** Output-only document; callers keep the source document for editing/playback. */
export function projectJianpuOutput(
  doc: ScoreDoc,
  mode: JianpuAccidentalMode,
): ScoreDoc {
  const output = cloneWithSurface(doc);
  function projectMeasures(measures: Measure[], initialKey: Key): void {
    let key = initialKey;
    let lanes = new Map<string, CarryPair & { grace?: CarryPair }>();
    const projectLayers = (items?: InlineItem[]) => {
      for (const item of items ?? [])
        if (item.kind === "layer") projectMeasures(item.measures, key);
    };
    measures.forEach((measure, mi) => {
      if (measure.attrs?.key) key = measure.attrs.key;
      if (!continuesMeasure(measures[mi - 1], measure)) lanes = new Map();
      for (const element of measure.elements) {
        if (element.kind !== "chord") continue;
        projectLayers(element.before);
        for (const sustain of element.sustains ?? [])
          projectLayers(sustain.before);
        const laneKey = `${element.staff}:${element.voice}`;
        let lane = lanes.get(laneKey);
        if (!lane)
          lanes.set(
            laneKey,
            (lane = {
              input: new AccidentalCarry(),
              output: new AccidentalCarry(),
              allOutput: new AccidentalCarry(),
            }),
          );
        // The existing 123 playback input carries accidentals over the main
        // melody only. Grace groups inherit that context, but cannot change
        // the sound of a following unmarked principal note.
        if (!element.grace) delete lane.grace;
        const context = element.grace
          ? (lane.grace ??= {
              input: lane.input.fork(),
              output: lane.output.fork(),
              allOutput: lane.allOutput.fork(),
            })
          : lane;
        const melody = topNote(element);
        for (const note of element.notes) {
          if (!note.degree) continue;
          // Read the original carry before deriving display marks. Rewriting
          // input degree first would turn a repeated flat into a natural.
          const fromDegree = context.input.pitch(note.degree, key);
          // Native ABC/MusicXML already resolve the real pitch, including
          // grace and parallel-voice carry rules of their source notation.
          const pitch = note.pitch ?? fromDegree;
          // Only the printed top note may update the melody carry. Hidden
          // chord tones keep an independent all-note context.
          const all = context.allOutput.mark(pitch, key);
          const required = note === melody ? context.output.mark(pitch, key) : all;
          const accidental =
            required ??
            (mode === "explicit"
              ? new AccidentalCarry().mark(pitch, key)
              : undefined);
          if (accidental) note.degree.accidental = accidental;
          else delete note.degree.accidental;
        }
      }
      for (const barline of measure.barlines ?? [])
        projectLayers(barline.before);
      projectLayers(measure.trailing);
    });
  }
  for (const song of output.songs) {
    for (const part of song.parts)
      projectMeasures(part.measures, song.key ?? { fifths: 0 });
  }
  return output;
}
