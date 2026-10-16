import type { ScoreDoc } from "../model/doc";
import { AccidentalCarry, continuesMeasure } from "../model/jianpu";

export type JianpuAccidentalMode = "explicit" | "measure";
export const DEFAULT_JIANPU_ACCIDENTALS: JianpuAccidentalMode = "explicit";

export const jianpuAccidentalMode = (value: unknown): JianpuAccidentalMode =>
  value === "measure" ? "measure" : DEFAULT_JIANPU_ACCIDENTALS;

interface CarryPair { input: AccidentalCarry; output: AccidentalCarry }

/** Output-only document; callers keep the source document for editing/playback. */
export function projectJianpuOutput(doc: ScoreDoc, mode: JianpuAccidentalMode): ScoreDoc {
  const output = structuredClone(doc);
  for (const song of output.songs) {
    for (const part of song.parts) {
      let key = song.key ?? { fifths: 0 };
      let lanes = new Map<string, CarryPair & { grace?: CarryPair }>();
      part.measures.forEach((measure, mi) => {
        if (measure.attrs?.key) key = measure.attrs.key;
        if (!continuesMeasure(part.measures[mi - 1], measure)) lanes = new Map();
        for (const element of measure.elements) {
          if (element.kind !== "chord") continue;
          const laneKey = `${element.staff}:${element.voice}`;
          let lane = lanes.get(laneKey);
          if (!lane) lanes.set(laneKey, lane = { input: new AccidentalCarry(), output: new AccidentalCarry() });
          // The existing 123 playback input carries accidentals over the main
          // melody only. Grace groups inherit that context, but cannot change
          // the sound of a following unmarked principal note.
          if (!element.grace) delete lane.grace;
          const context = element.grace
            ? lane.grace ??= { input: lane.input.fork(), output: lane.output.fork() }
            : lane;
          for (const note of element.notes) {
            if (!note.degree) continue;
            // Read the original carry before deriving display marks. Rewriting
            // input degree first would turn a repeated flat into a natural.
            const pitch = context.input.pitch(note.degree, key);
            const required = context.output.mark(pitch, key);
            const accidental = required ?? (mode === "explicit" ? new AccidentalCarry().mark(pitch, key) : undefined);
            if (accidental) note.degree.accidental = accidental;
            else delete note.degree.accidental;
          }
        }
      });
    }
  }
  return output;
}
