// Nota prototype: use Dolce's existing 123 representation and musical rules.
import type { Degree, Key, Pitch } from "../model/doc";
import { AccidentalCarry, degreeFromPitch, continuesMeasure } from "../model/jianpu";
import { midiOfPitch, transposeFifths } from "../model/edit";
import { jpPitch } from "../score/jppitch";
import { parse123 } from "../j123/parse";
import { emit123 } from "../j123/emit";
import { DEFAULT_JIANPU_ACCIDENTALS, projectJianpuOutput, type JianpuAccidentalMode } from "./jianpu-output";

export type ConversionMode = "transpose" | "renotate";
export const KEYS = [
  { name: "C", fifths: 0 }, { name: "D♭", fifths: -5 },
  { name: "D", fifths: 2 }, { name: "E♭", fifths: -3 },
  { name: "E", fifths: 4 }, { name: "F", fifths: -1 },
  { name: "F♯", fifths: 6 }, { name: "G", fifths: 1 },
  { name: "A♭", fifths: -4 }, { name: "A", fifths: 3 },
  { name: "B♭", fifths: -2 }, { name: "B", fifths: 5 },
] as const;

export function keyLabel(fifths: number): string {
  return KEYS.find((k) => k.fifths === fifths)?.name
    ?? ({ [-7]: "C♭", [-6]: "G♭", 7: "C♯" } as Record<number, string>)[fifths] ?? "C";
}

const pitchOf = (degree: number, octave: number, fifths: number): Pitch =>
  jpPitch(degree, octave, fifths) as Pitch;

// Prefer a simple accidental; retain the source letter when equally simple.
function spelling(midi: number, key: Key, source: Pitch): Pitch {
  let best: Pitch | undefined;
  let cost = Infinity;
  for (let number = 1; number <= 7; number++) {
    const base = pitchOf(number, 0, key.fifths);
    const octave = Math.round((midi - midiOfPitch(base)) / 12);
    const p = pitchOf(number, octave, key.fifths);
    const offset = midi - midiOfPitch(p);
    const score = Math.abs(offset) * 10 + (p.step === source.step ? 0 : 1);
    if (Math.abs(offset) <= 2 && score < cost) {
      best = { ...p, alter: p.alter + offset };
      cost = score;
    }
  }
  if (!best) throw new Error("这个音暂时无法用目标基准表示。");
  return best;
}

/** A plain 123 score in, a plain 123 score out. No additional storage model. */
export function convertPracticeText(text: string, target: number, mode: ConversionMode, accidentalMode: JianpuAccidentalMode = DEFAULT_JIANPU_ACCIDENTALS) {
  if (!Number.isInteger(target) || target < -7 || target > 7) throw new Error("请选择有效的目标基准。");
  const doc = parse123(text);
  if (doc.diagnostics.some((d) => d.severity === "error")) throw new Error("请先修正源码中的解析错误，再转换。");
  if (doc.songs.length !== 1 || doc.songs[0]!.parts.length !== 1) {
    throw new Error("这一版先支持单首、单旋律简谱，请先选取一个旋律声部。");
  }
  const song = doc.songs[0]!;
  const part = song.parts[0]!;
  const initialKey = song.key ?? { fifths: 0 };
  const shift = mode === "transpose"
    ? midiOfPitch(pitchOf(1, 0, target)) - midiOfPitch(pitchOf(1, 0, initialKey.fifths)) : 0;
  let sourceKey = initialKey;
  let inputCarry = new AccidentalCarry();
  let outputCarry = new AccidentalCarry();
  let graceCarry: { input: AccidentalCarry; output: AccidentalCarry } | undefined;
  let notes = 0;
  let harmony = false;
  const preview: string[] = [];

  part.measures.forEach((measure, mi) => {
    if (measure.attrs?.key) sourceKey = measure.attrs.key;
    const fifths = mode === "renotate" ? target
      : sourceKey.fifths === initialKey.fifths ? target : transposeFifths(sourceKey.fifths, shift);
    // A 1= reference is a notation reference, independent of major/minor tonality.
    const outputKey: Key = { fifths };
    if (measure.attrs?.key) measure.attrs.key = outputKey;
    if (!continuesMeasure(part.measures[mi - 1], measure)) {
      inputCarry = new AccidentalCarry();
      outputCarry = new AccidentalCarry();
      graceCarry = undefined;
    }
    for (const element of measure.elements) {
      if (element.kind !== "chord") continue;
      if (element.notes.length > 1 || element.voice > 1) {
        throw new Error("这一版先支持单旋律，暂不转换和弦内多音或交叠声部。");
      }
      harmony ||= !!element.harmony || !!element.laterHarmonies?.length || !!element.sustains?.some((s) => s.harmony);
      // Match the unified 123 playback: grace groups inherit the main melody's
      // context but never change a following principal note's accidental carry.
      if (!element.grace) graceCarry = undefined;
      const context = element.grace
        ? graceCarry ??= { input: inputCarry.fork(), output: outputCarry.fork() }
        : { input: inputCarry, output: outputCarry };
      for (const note of element.notes) {
        if (!note.degree) throw new Error("有音符缺少简谱记录，请先转换为简谱再试。");
        const original = context.input.pitch(note.degree, sourceKey);
        let degree: Degree;
        if (mode === "transpose") {
          degree = { ...note.degree };
          const moved = context.output.pitch(degree, outputKey);
          const octaves = (midiOfPitch(original) + shift - midiOfPitch(moved)) / 12;
          if (!Number.isInteger(octaves)) throw new Error("这处调号暂时无法按同一音程移调。");
          degree.octaveShift += octaves;
        } else {
          const p = spelling(midiOfPitch(original), outputKey, original);
          const accidental = context.output.mark(p, outputKey);
          degree = degreeFromPitch(p, outputKey, accidental);
        }
        note.degree = degree;
        delete note.pitch;
        notes++;
      }
    }
  });
  if (!notes) throw new Error("请先导入或打开一份有音符的乐谱。");
  song.key = { fifths: target };
  const output = projectJianpuOutput(doc, accidentalMode);
  const acc = { flat: "♭", sharp: "♯", natural: "♮", "double-flat": "𝄫", "double-sharp": "𝄪" };
  for (const measure of output.songs[0]!.parts[0]!.measures) for (const element of measure.elements) {
    if (element.kind !== "chord") continue;
    for (const note of element.notes) {
      const degree = note.degree!;
      if (preview.length < 10) preview.push(`${degree.accidental ? acc[degree.accidental] : ""}${degree.number}${degree.octaveShift > 0 ? "′".repeat(degree.octaveShift) : "̣".repeat(-degree.octaveShift)}`);
    }
  }
  return {
    text: emit123(output), notes, shift, preview: preview.join("  "),
    sourceKey: keyLabel(initialKey.fifths), targetKey: keyLabel(target),
    warning: harmony && mode === "transpose" ? "谱中的和弦名称未跟随移调，请手工核对。" : "",
  };
}
