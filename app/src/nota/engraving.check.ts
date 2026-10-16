import { parse123 } from "../j123/parse";
import { docView } from "../pu/slots";

// Adjacent explicit triplets must not gain an extra six-note bracket.
const doc = parse123("T:相邻三连音\nM:2/4\nK:1=G\n(3:5,_ 5,_ 5,_)(3:5,_ 5,_ 5,_) |]");
const before = JSON.stringify(doc);
const view = docView(doc);
const marks = view.songs.flatMap(s => s.pages.flatMap(p => p.groups.flatMap(g => g.voices.flatMap(v => v.marks))));
const tuplets = marks.filter(m => m.type === "tuplet");
if (tuplets.length !== 2 || tuplets.some(t => t.end - t.start !== 2)) throw new Error("Extra bracket over adjacent triplets");
if (JSON.stringify(doc) !== before) throw new Error("Engraving changed score data");

// The timeMod-only fallback is still needed for imports without explicit marks.
const imported = structuredClone(doc);
imported.songs[0]!.marks = [];
const fallback = docView(imported).songs.flatMap(s => s.pages.flatMap(p => p.groups.flatMap(g => g.voices.flatMap(v => v.marks))));
if (!fallback.some(m => m.type === "tuplet")) throw new Error("Missing imported tuplet fallback");
console.log("Engraving: adjacent triplets retain two brackets and unchanged score data.");
