import { parse123, parseAbc } from "../j123/parse";
import { docView } from "../pu/slots";
import { playSourceOf } from "../model/playsong";
import { isTimelineChord } from "../score/timeline";
import { emitJianpu123 } from "./text-output";
import { loadScoreDoc } from "../model/fromxml";
import { DOMParser } from "@xmldom/xmldom";

Object.defineProperty(globalThis, "DOMParser", { configurable: true, value: DOMParser });

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}\nActual: ${JSON.stringify(actual)}\nExpected: ${JSON.stringify(expected)}`);
}
const input = parse123("T:123文本输出\nM:4/4\nK:1=C\n1 b3 5 3 |]");
const raw = JSON.stringify(input);
for (const mode of ["explicit", "measure"] as const) {
  const output = parse123(emitJianpu123(input, mode));
  const marks = docView(output).songs.flatMap(s => s.pages.flatMap(p => p.groups.flatMap(g => g.voices.flatMap(v => v.elements.filter(n => n.kind === "note").map(n => n.kind === "note" ? n.accidental ?? "" : "")))));
  equal(marks, mode === "explicit" ? ["", "flat", "", "flat"] : ["", "flat", "", ""], `${mode}: exported 123 uses the selected spelling`);
  equal(playSourceOf(output)!.parts[0]!.measures[0]!.entries.filter(isTimelineChord).map(c => c.notes[0]!.pitch), [60, 63, 67, 63], `${mode}: downloaded text re-reads with an E-flat fourth note`);
  equal(JSON.stringify(input), raw, "Text export does not modify the source");
}
const music = (text: string) => JSON.parse(JSON.stringify(playSourceOf(parse123(text)), (key, value: unknown) => key === "jpAlter" ? undefined : value));
for (const body of [
  "#4 4 n4 4 | b3 $ 3' n3' 3 |]",
  "{b3}3 3 n3 0 | (3:b3_ 3_ 3_) n3 5 0 |]",
  "|: (b3_ 3_) n3 0 5 |[1 b3 3 5 3 :|[2 3 b3 5 3 |]\nw:风 儿 轻 轻 吹 吹 吹 吹 吹 吹 吹 吹",
  "b3 3 5 3 | [K:1=F] #4 4 n4 4 |]",
]) {
  const original = `T:文本往返结构\nM:4/4\nK:1=C\n${body}`;
  const doc = parse123(original);
  const before = JSON.stringify(doc);
  for (const mode of ["explicit", "measure"] as const) equal(music(emitJianpu123(doc, mode)), music(original), `${mode}: exported text preserves unified playback, rhythm, lyrics and repeats`);
  equal(JSON.stringify(doc), before, "Output preserves all original source data and evidence");
}
// Native ABC is an already supported source, including the verified import path.
const native = parseAbc("X:1\nT:Native ABC\nM:4/4\nL:1/4\nK:C\nC _E G _E |]");
equal(parse123(emitJianpu123(native, "measure")).diagnostics.filter(d => d.severity === "error"), [], "Monophonic native source exports to readable 123");
const xml = `<score-partwise version="4.0"><work><work-title>Native XML</work-title></work><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note><note><pitch><step>E</step><alter>-1</alter><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note><note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note><note><pitch><step>E</step><alter>-1</alter><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note></measure></part></score-partwise>`;
for (const native of [parseAbc("X:1\nT:ABC\nM:4/4\nL:1/4\nK:C\nC _E G _E |]"), loadScoreDoc(xml)]) {
  const before = JSON.stringify(native);
  for (const mode of ["explicit", "measure"] as const) {
    const output = parse123(emitJianpu123(native, mode));
    equal(playSourceOf(output)!.parts[0]!.measures[0]!.entries.filter(isTimelineChord).map(c => c.notes[0]!.pitch), [60, 63, 67, 63], `${native.sourceFormat}/${mode}: actual native pitches survive text export`);
  }
  equal(JSON.stringify(native), before, "Native source remains unchanged across both text outputs");
}
for (const mode of ["explicit", "measure"] as const) {
  const tied = parseAbc("X:1\nT:不能有损下载\nM:4/4\nL:1/4\nK:C\nC2- C2 |]");
  const before = JSON.stringify(tied);
  let message = "";
  try { emitJianpu123(tied, mode); } catch (error) { message = String(error); }
  if (!message.includes("123")) throw new Error(`${mode}: expected lossy ABC tie conversion to be rejected; got ${message || "successful download"}`);
  equal(JSON.stringify(tied), before, "Rejected output retains the native source");
  const xmlTie = loadScoreDoc(xml.replace("</type>", '</type><tie type="start"/>'));
  let xmlMessage = "";
  try { emitJianpu123(xmlTie, mode); } catch (error) { xmlMessage = String(error); }
  if (!xmlMessage.includes("123")) throw new Error(`${mode}: expected lossy XML tie conversion to be rejected`);
}
console.log("123 text output: chosen accidentals round-trip without changing the source.");
