import { prepareTuning, restoreTuning, type TuningDraft } from "./tuning";
// Semantic regression checks: compare what sounds and the musical structure.
import { convertPracticeText, KEYS } from "./convert";
import { PRACTICE_SAMPLE } from "./sample";
import { parse123 } from "../j123/parse";
import { AccidentalCarry, continuesMeasure } from "../model/jianpu";
import { midiOfPitch } from "../model/edit";
import type { Degree } from "../model/doc";
import { docView } from "../pu/slots";
import { playSourceOf } from "../model/playsong";
import { isTimelineChord } from "../score/timeline";

function equal(actual: unknown, expected: unknown, message: string): void {
  const normalize = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(normalize);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k, value]) => !/source$/i.test(k) && value !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, value]) => [k, normalize(value)]));
    return v;
  };
  if (JSON.stringify(normalize(actual)) !== JSON.stringify(normalize(expected))) {
    throw new Error(`${message}\nActual: ${JSON.stringify(normalize(actual)).slice(0, 1800)}\nExpected: ${JSON.stringify(normalize(expected)).slice(0, 1800)}`);
  }
}

function inspect(text: string) {
  const doc = parse123(text);
  equal(doc.diagnostics.filter((d) => d.severity === "error"), [], "output parses");
  const song = doc.songs[0]!;
  const part = song.parts[0]!;
  let key = song.key ?? { fifths: 0 };
  let carry = new AccidentalCarry();
  const pitches: number[] = [];
  const degrees: Degree[] = [];
  const events: unknown[] = [];
  part.measures.forEach((m, i) => {
    if (m.attrs?.key) key = m.attrs.key;
    if (!continuesMeasure(part.measures[i - 1], m)) carry = new AccidentalCarry();
    for (const el of m.elements) {
      if (el.kind !== "chord") continue;
      events.push({ rest: !!el.rest, grace: !!el.grace, duration: el.duration, lyrics: el.lyrics, sustains: el.sustains?.length ?? 0 });
      for (const n of el.notes) {
        if (!n.degree) throw new Error("missing degree");
        pitches.push(midiOfPitch(carry.pitch(n.degree, key)));
        degrees.push(n.degree);
      }
    }
  });
  const ids = part.measures.flatMap((m) => m.elements.map((el) => el.id));
  const structure = {
    events,
    bars: part.measures.map((m) => m.barlines?.map(({ source: _source, ...bar }) => bar)),
    marks: song.marks.map(({ source: _source, ...mark }) => ({ ...mark, start: ids.indexOf(mark.start), end: ids.indexOf(mark.end) })),
  };
  return { pitches, degrees, structure, song };
}

const example = "T:八度验证\nM:4/4\nK:1=bE\n6, 1 3 0 |]";
const moscowOpening = "T:莫斯科开头\nM:2/4\nK:1=bE\n6,_ 1_ 3_ 1_ |]";
const carried = convertPracticeText(moscowOpening, 0, "renotate", "measure");
equal(carried.preview, "1  ♭3  5  3", "Conversion summary uses the same selected output marks");
equal(inspect(carried.text).degrees.map(d => d.accidental), [undefined, "flat", undefined, undefined], "measure-mode renotation leaves Moscow's fourth mark implicit");
equal(inspect(carried.text).pitches, [60, 63, 67, 63], "measure-mode fourth note still sounds E-flat4");
const playbackPitches = (text: string) => playSourceOf(parse123(text))!.parts.flatMap(p => p.measures.flatMap(m => m.entries.filter(isTimelineChord).filter(c => !c.rest).flatMap(c => c.notes.map(n => n.pitch))));
const graceInput = "T:倚音不可改变主旋律\nM:3/4\nK:1=C\n{b3}3 3 n3 |]";
equal(playbackPitches(graceInput), [64, 64, 64], "original unified playback does not carry a grace flat into the main notes");
for (const accidentalMode of ["explicit", "measure"] as const) {
  for (const target of KEYS) for (const mode of ["transpose", "renotate"] as const) {
    const result = convertPracticeText(graceInput, target.fifths, mode, accidentalMode);
    equal(playbackPitches(result.text), [64 + result.shift, 64 + result.shift, 64 + result.shift], `${accidentalMode}: ${mode} to ${target.name} preserves the original main melody interval`);
  }
}
const original = inspect(example);
equal(original.pitches, [60, 63, 67], "explicit octaves in original");
const moved = convertPracticeText(example, 0, "transpose");
equal(inspect(moved.text).pitches, [57, 60, 64], "Eb to C transposes down three semitones");
equal(inspect(moved.text).degrees, original.degrees, "transpose preserves numbered degrees");
const rewritten = convertPracticeText(example, 0, "renotate");
equal(inspect(rewritten.text).pitches, original.pitches, "renotation preserves every sounding pitch");
equal(inspect(rewritten.text).degrees.map((d) => d.number), [1, 3, 5], "renotation produces 1 flat-3 5");
equal(inspect(rewritten.text).degrees[1]!.accidental, "flat", "Eb is flat-3 in C");

const fixtures = [
  PRACTICE_SAMPLE,
  "T:临时记号与八度\nM:4/4\nK:1=F\n#4 4 n4 0 | b7 7 n7 1' | 1, 7,, #1' 1' |]",
  "T:反复连线\nM:4/4\nK:1=bE\n|: (1_ 2_ 3.) 0_ 5 |[1 6 - 5 - :|[2 4 3 2 1 |]",
  "T:曲中换基准\nM:4/4\nK:1=bB\n1 2 3 4 | [K:1=G] 1 2 3 4 | [K:1=bE] 6, 1 3 0 |]",
  "T:倚音与三连音\nM:4/4\nK:1=D\n{2}1 (3:2_ 3_ 4_) 5 0 |]",
];
let cases = 0;
for (const fixture of fixtures) {
  const before = inspect(fixture);
  for (const target of KEYS) for (const mode of ["transpose", "renotate"] as const) for (const accidentalMode of ["explicit", "measure"] as const) {
    const out = convertPracticeText(fixture, target.fifths, mode, accidentalMode);
    const after = inspect(out.text);
    equal(after.pitches, before.pitches.map((p) => p + out.shift), `${mode} to ${target.name}: pitch invariant`);
    equal(after.structure, before.structure, `${mode} to ${target.name}: rests, rhythm, lyrics, repeats and arcs`);
    equal(playbackPitches(out.text), playbackPitches(fixture).map(p => p + out.shift), `${mode}/${accidentalMode} to ${target.name}: unified playback interval invariant`);
    const back = convertPracticeText(out.text, before.song.key?.fifths ?? 0, "renotate");
    equal(inspect(back.text).pitches, after.pitches, "renotation round trip preserves octaves");
    cases++;
  }
}

// Every key pair, including B/Bb's upstream base-octave convention.
for (const source of KEYS) for (const target of KEYS) {
  const text = `T:调号组合\nM:4/4\nK:1=${source.name.replace("♭", "b").replace("♯", "#").replace(/^([A-G])([b#])$/, "$2$1")}\n1, 7, 1 7 | #4 4 n4 1' |]`;
  const before = inspect(text);
  for (const mode of ["transpose", "renotate"] as const) for (const accidentalMode of ["explicit", "measure"] as const) {
    const out = convertPracticeText(text, target.fifths, mode, accidentalMode);
    equal(inspect(out.text).pitches, before.pitches.map((p) => p + out.shift), "all key-pair pitch invariants");
    equal(playbackPitches(out.text), playbackPitches(text).map(p => p + out.shift), "all key-pair unified playback invariants");
    cases++;
  }
}
console.log(`Nota: ${cases} conversion cases passed, including pitch, octave, rhythm, rests, lyrics, grace notes, tuplets, key changes and repeats.`);

// Practice renotation must make each altered note readable without relying on
// a previous accidental. Keep cancellation naturals and sounding pitches intact.
for (const fixture of [
  { text: "K:1=bE\n1 1 |]", marks: ["flat", "flat"] },
  { text: "M:2/4\nK:1=bE\n6,_ 1_ 3_ 1_ |]", marks: [undefined, "flat", undefined, "flat"] },
  { text: "K:1=G\n7 7 |]", marks: ["sharp", "sharp"] },
  { text: "K:1=bE\n1 #1 n1 1 |]", marks: ["flat", "natural", "flat", "flat"] },
  { text: "K:1=bE\n1 1' 1, |]", marks: ["flat", "flat", "flat"] },
]) {
  const before = inspect(fixture.text);
  const converted = convertPracticeText(fixture.text, 0, "renotate").text;
  const after = inspect(converted);
  equal(after.degrees.map(d => d.accidental), fixture.marks, "renotation prints every altered note, including Moscow's fourth note");
  equal(after.pitches, before.pitches, "explicit practice accidentals preserve actual pitches");
  equal(after.structure, before.structure, "explicit practice accidentals preserve rhythm and structure");
  const printedNotes = docView(parse123(converted)).songs.flatMap(s => s.pages.flatMap(p => p.groups.flatMap(g => g.voices.flatMap(v => v.elements.filter(e => e.kind === "note")))));
  equal(printedNotes.map(n => n.kind === "note" ? n.accidental : undefined), fixture.marks, "engraving projection retains explicit practice accidentals");
  const playbackPitches = (text: string) => playSourceOf(parse123(text))!.parts.flatMap(p => p.measures.flatMap(m => m.entries.filter(isTimelineChord).flatMap(c => c.notes.map(n => n.pitch))));
  equal(playbackPitches(converted), playbackPitches(fixture.text), "real playback input retains pitches with explicit practice accidentals");
}
console.log("Practice renotation: repeated flats/sharps, octave changes and cancellation naturals are explicit and pitch preserving.");

// 高层调式旅程：真实123解析/转换与可还原稿，之后的人工修改不能被旧稿覆盖。
const tuningBefore: TuningDraft = {key:"library-song-1",format:"123",text:example,context:"original-image-project"};
const tuningResult = prepareTuning(tuningBefore, parse123(example), example, 0, "renotate", "explicit");
const tuningAfter: TuningDraft = {...tuningBefore,text:tuningResult.text};
equal(restoreTuning({before:tuningBefore,after:tuningAfter},tuningAfter),tuningBefore,"unchanged converted draft restores exact original");

for(const method of ["renotate","transpose"] as const) {
  const result=prepareTuning(tuningBefore,parse123(example),example,0,method,"explicit");
  equal(inspect(result.text).pitches,method === "renotate" ? [60,63,67] : [57,60,64],"dialog preparation uses actual octave-aware conversion");
  equal(inspect(result.text).structure,inspect(example).structure,"tuning journey preserves rhythm/rests/bars");
}
for(const edited of [
  {...tuningAfter,text:tuningAfter.text + "\nT:人工修改"},
  {...tuningAfter,key:"another-song"},
  {...tuningAfter,format:"abc" as const},
  {...tuningAfter,context:"edited-original-image"},
]) {
  let rejected=false;
  try {restoreTuning({before:tuningBefore,after:tuningAfter},edited);} catch {rejected=true;}
  equal(rejected,true,"restore refuses changed text/identity/format/original project");
}
