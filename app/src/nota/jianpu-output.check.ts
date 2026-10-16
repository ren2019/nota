import { parse123 } from "../j123/parse";
import { docView } from "../pu/slots";
import { playSourceOf } from "../model/playsong";
import { emit123 } from "../j123/emit";
import { projectJianpuOutput } from "./jianpu-output";
import type { ScoreDoc } from "../model/doc";
import type { NoteElement } from "../pu/ast";
import { loadPersistedSettings, savePersistedSettings } from "../editor/settings";

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}\nActual: ${JSON.stringify(actual)}\nExpected: ${JSON.stringify(expected)}`);
  }
}

function visibleNotes(doc: ScoreDoc) {
  const notes = (e: NoteElement): [number, string][] => [
    ...e.graceBefore.flatMap(notes), [e.pitch, e.accidental ?? ""], ...e.graceAfter.flatMap(notes),
  ];
  return docView(doc).songs.flatMap(s => s.pages.flatMap(p => p.groups.flatMap(g => g.voices.flatMap(v =>
    v.elements.filter(e => e.kind === "note").flatMap(e => {
      if (e.kind !== "note") throw new Error("Expected note");
      return notes(e);
    }),
  ))));
}

// jpAlter is a display glyph carried alongside MIDI pitch; it is allowed to
// change. Every timing, pitch, tie and play-order field must remain identical.
const playback = (doc: ScoreDoc) => JSON.parse(JSON.stringify(playSourceOf(doc), (key, value: unknown) => key === "jpAlter" ? undefined : value));

const source = parse123("T:重复降号\nM:4/4\nK:1=C\n1 b3 5 3 |]");
const original = JSON.stringify(source);
const originalPlay = playback(source);
equal(originalPlay.parts[0].measures[0].entries.map((e: { notes: { pitch: number }[] }) => e.notes[0]!.pitch), [60, 63, 67, 63], "Fourth note is E-flat4, independently of visible marks");
const explicit = projectJianpuOutput(source, "explicit");
equal(visibleNotes(explicit), [[1, ""], [3, "flat"], [5, ""], [3, "flat"]], "Explicit output marks the fourth E-flat");
equal(visibleNotes(projectJianpuOutput(explicit, "measure")), [[1, ""], [3, "flat"], [5, ""], [3, ""]], "Measure output omits the repeated flat");
equal(playback(explicit), originalPlay, "Output preserves unified playback");
equal(playback(parse123(emit123(explicit))), originalPlay, "Output text re-reads with the same music");
equal(JSON.stringify(source), original, "Output leaves source and source locations unchanged");

const fixtures = [
  { name: "sharps and necessary naturals", body: "#4 4 n4 4 | #4 4 n4 4 |]", explicit: ["sharp", "sharp", "natural", "", "sharp", "sharp", "natural", ""], measure: ["sharp", "", "natural", "", "sharp", "", "natural", ""] },
  { name: "carry across octaves", body: "b3 3' n3' 3 | b3 3 3' n3 |]", explicit: ["flat", "flat", "natural", "", "flat", "flat", "flat", "natural"], measure: ["flat", "", "natural", "", "flat", "", "", "natural"] },
  { name: "line break continues a real measure", body: "b3 $ 3 n3 3 | 3 b3 3 n3 |]", explicit: ["flat", "flat", "natural", "", "", "flat", "flat", "natural"], measure: ["flat", "", "natural", "", "", "flat", "", "natural"] },
  { name: "changed reference", body: "b3 3 | [K:1=F] #4 4 n4 4 |]", explicit: ["flat", "flat", "sharp", "sharp", "natural", ""], measure: ["flat", "", "sharp", "", "natural", ""] },
  { name: "grace does not change main melody carry", body: "{b3}3 3 n3 0 |]", explicit: ["flat", "", "", "", ""], measure: ["flat", "", "", "", ""] },
  { name: "slurs rests lyrics repeat and endings", body: "|: (b3_ 3_) n3 0 5 |[1 b3 3 5 3 :|[2 3 b3 5 3 |]\nw:风 儿 轻 轻 吹 吹 吹 吹 吹 吹 吹 吹", explicit: ["flat", "flat", "natural", "", "", "flat", "flat", "", "flat", "", "flat", "", "flat"], measure: ["flat", "", "natural", "", "", "flat", "", "", "", "", "flat", "", ""] },
];
for (const fixture of fixtures) {
  const doc = parse123(`T:${fixture.name}\nM:4/4\nK:1=C\n${fixture.body}`);
  equal(doc.diagnostics.filter(d => d.severity === "error"), [], `${fixture.name}: valid fixture`);
  const raw = JSON.stringify(doc);
  const music = playback(doc);
  for (const mode of ["explicit", "measure"] as const) {
    const output = projectJianpuOutput(doc, mode);
    equal(visibleNotes(output).map(n => n[1]), fixture[mode], `${fixture.name}: ${mode} visible accidentals`);
    equal(playback(output), music, `${fixture.name}: ${mode} pitch, timing and repeat invariants`);
    equal(playback(parse123(emit123(output))), music, `${fixture.name}: ${mode} text re-read`);
    const structure = (value: ScoreDoc) => JSON.stringify(value, (key, entry: unknown) => key === "accidental" ? undefined : entry);
    equal(structure(output), structure(doc), `${fixture.name}: only accidental presentation changes, including source locations and marks`);
    equal([...docView(output).elementOf.keys()], [...docView(doc).elementOf.keys()], `${fixture.name}: element identities stay aligned`);
    equal(visibleNotes(projectJianpuOutput(projectJianpuOutput(output, mode === "explicit" ? "measure" : "explicit"), mode)), visibleNotes(output), `${fixture.name}: repeated switching has no cumulative effect`);
  }
  equal(JSON.stringify(doc), raw, `${fixture.name}: source spans, evidence and original content remain unchanged`);
}

// The persisted settings interface is the storage boundary used by App. New
// preferences must coexist with old paper/style choices, and fail closed.
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
} });
savePersistedSettings({ jianpuAccidentals: "measure", styleLayers: { print: [{ fontSize: 22 }] }, zoom: 1.3 });
equal(loadPersistedSettings()?.jianpuAccidentals, "measure", "Preference survives reopening settings");
storage.set("dolce-render-settings", '{"jianpuAccidentals":"broken","zoom":1.3,"styleLayers":{"print":[]}}');
equal(loadPersistedSettings()?.jianpuAccidentals, "explicit", "Invalid preference falls back to explicit");
equal(loadPersistedSettings()?.zoom, 1.3, "Invalid preference leaves other settings intact");
storage.set("dolce-render-settings", '{"zoom":1.3,"styleLayers":{"print":[]}}');
equal(loadPersistedSettings()?.jianpuAccidentals, "explicit", "Old settings acquire the default preference");
equal(loadPersistedSettings()?.styleLayers, { print: [] }, "Old style settings survive");
storage.set("dolce-render-settings", "not json");
equal(loadPersistedSettings(), null, "Malformed settings leave App defaults available");
Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("Unavailable storage"); } });
equal(loadPersistedSettings(), null, "Unavailable storage leaves App defaults available");
savePersistedSettings({ jianpuAccidentals: "measure" });
console.log("Jianpu output: explicit and measure accidental projections preserve source and music.");
