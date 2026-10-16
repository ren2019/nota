import { DOMParser } from "@xmldom/xmldom";
import { loadScoreDoc } from "../model/fromxml";
import { docView } from "../pu/slots";
import { projectJianpuOutput } from "./jianpu-output";

Object.defineProperty(globalThis, "DOMParser", {
  configurable: true,
  value: DOMParser,
});
function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `${message}\nActual: ${JSON.stringify(actual)}\nExpected: ${JSON.stringify(expected)}`,
    );
}
const xml = `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><grace/><pitch><step>E</step><alter>-1</alter><octave>4</octave></pitch><type>eighth</type><notations><slur type="start" number="1"/></notations></note><note><pitch><step>E</step><alter>-1</alter><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note><note><pitch><step>E</step><alter>-1</alter><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note><note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><type>half</type><notations><slur type="stop" number="1"/></notations></note></measure></part></score-partwise>`;
const source = loadScoreDoc(xml);
const visible = (doc: ReturnType<typeof loadScoreDoc>) =>
  docView(doc).songs.flatMap((s) =>
    s.pages.flatMap((p) =>
      p.groups.flatMap((g) =>
        g.voices.flatMap((v) =>
          v.elements.flatMap((e) =>
            e.kind === "note"
              ? [
                  ...e.graceBefore.map((n) => n.accidental ?? ""),
                  e.accidental ?? "",
                ]
              : [],
          ),
        ),
      ),
    ),
  );
equal(
  visible(projectJianpuOutput(source, "explicit")),
  ["flat", "flat", "flat", "natural"],
  "Native XML grace and following E-flat principal notes keep their real pitches",
);
console.log("Jianpu origins: native pitch and grace context preserved.");

// The DOM/font measurement boundary is deterministic here. This verifies the
// real page/PPTX pipeline and identities, not browser font geometry (checked in Safari).
function fontSize(font: string): number {
  return Number(/([\d.]+)px/.exec(font)?.[1] ?? 12);
}
const context = {
  font: "12px sans-serif",
  measureText(text: string) {
    const size = fontSize(this.font);
    return {
      width: text.length * size * 0.6,
      actualBoundingBoxLeft: 1,
      actualBoundingBoxRight: text.length * size * 0.6,
      actualBoundingBoxAscent: size * 0.75,
      actualBoundingBoxDescent: size * 0.1,
    };
  },
};
function svgNode() {
  return {
    style: {},
    isConnected: true,
    textContent: "",
    attrs: new Map<string, string>(),
    appendChild() {},
    setAttribute(key: string, value: string) {
      this.attrs.set(key, value);
    },
    getComputedTextLength() {
      return (
        this.textContent.length *
        Number(this.attrs.get("font-size") ?? 12) *
        0.6
      );
    },
    getBBox() {
      const size = Number(this.attrs.get("font-size") ?? 12);
      return {
        x: 0,
        y: -size * 0.75,
        width: this.getComputedTextLength(),
        height: size * 0.85,
      };
    },
  };
}
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: {
    getElementById: () => null,
    body: { appendChild() {} },
    createElementNS: () => svgNode(),
    createElement: () => ({ getContext: () => context }),
  },
});
const { ScorePainter, PaintResources } = await import("../layout/painter");
const { MetaData, GlyphCodes } = await import("../smufl/smufl");
const { TextFrame } = await import("../layout/pageitem");
const { computeStyleForPaper, THEMES } = await import("../style/themes");
const meta = await MetaData.load("/redist/bravura_metadata.json");
const painter = new ScorePainter(PaintResources.fixed(meta));
const textOf = (item: import("../layout/pageitem").PageItem): string[] => [
  ...(item instanceof TextFrame ? [item.text] : []),
  ...item.children.flatMap(textOf),
];
const flatCount = () =>
  painter
    .result!.pages.flatMap((p) => textOf(p.root))
    .filter(
      (t) =>
        t === GlyphCodes.csymAccidentalFlat || t === GlyphCodes.accidentalFlat,
    ).length;
// Same existing native input as above: a grace E-flat, two principal E-flats,
// then a natural. Mixed must use the requested marks without changing raw XML.
const raw = JSON.stringify(source);
await painter.load({
  view: "mixed",
  doc: source,
  page: { widthPt: 595, heightPt: 842, override: true },
  hideBarNumber: true,
  accidentalMode: "explicit",
});
equal(
  flatCount(),
  3,
  "Mixed overlay prints every altered principal note and grace",
);
equal(
  JSON.stringify(source),
  raw,
  "Mixed layout never mutates native source or raw accidentals",
);
console.log(
  "Jianpu origins: real mixed painter applies requested accidental mode.",
);

const { parse123, parseAbc } = await import("../j123/parse");
const { parsePu } = await import("../pu/parse");
const { JpwFile } = await import("../jpword/jpwfile");
const { jpwToScoreDoc } = await import("../model/fromjpw");
const { playSourceOf } = await import("../model/playsong");
const jpw = JpwFile.fromString(
  ".Title\nTitle = {JPW repeated flats}\nKeyAndMeters = {1=C,4/4}\n.Voice\n1 b3 5 3 |]\n.Words\nW1@1,1:风儿轻吹",
);
if (!jpw) throw new Error("Valid JP-Word fixture expected");
const fixtures = [
  ["123/recognized", parse123("T:Repeated flats\nM:4/4\nK:1=C\n1 b3 5 3 |]")],
  ["ABC", parseAbc("X:1\nT:Repeated flats\nM:4/4\nL:1/4\nK:C\nC _E G E |]")],
  ["JP-Word", jpwToScoreDoc(jpw)],
  ["text score", parsePu("V:Repeated flats\nD:C\nP:4/4\nQ:1 3$ 5 3 ||")],
] as const;
const music = (doc: ReturnType<typeof loadScoreDoc>) =>
  JSON.parse(
    JSON.stringify(playSourceOf(doc), (key, value: unknown) =>
      key === "jpAlter" ? undefined : value,
    ),
  );
for (const [name, doc] of fixtures) {
  const before = JSON.stringify(doc);
  const originalMusic = music(doc);
  for (const mode of ["explicit", "measure"] as const) {
    const output = projectJianpuOutput(doc, mode);
    equal(
      visible(output),
      mode === "explicit" ? ["", "flat", "", "flat"] : ["", "flat", "", ""],
      `${name}: source parser and output projection agree`,
    );
    equal(
      music(output),
      originalMusic,
      `${name}: sounding pitches, play order and rhythm are unchanged`,
    );
    equal(
      [...docView(output).elementOf.keys()],
      [...docView(doc).elementOf.keys()],
      `${name}: visible notes map back to original element IDs`,
    );
    for (const view of ["original", "expanded"] as const) {
      const style = computeStyleForPaper(
        [view === "expanded" ? THEMES.projection : THEMES.print],
        { mode: view, engine: "jianpu" },
      );
      painter.loadSync({ view, doc, style, accidentalMode: mode });
      equal(
        flatCount(),
        mode === "explicit" ? 2 : 1,
        `${name}: ${view} page tree uses ${mode} marks, including PPTX source`,
      );
      equal(
        painter.pptxSource.pages.length,
        painter.pageCount,
        `${name}: PPTX consumes the same completed pages`,
      );
    }
  }
  equal(
    JSON.stringify(doc),
    before,
    `${name}: all view changes preserve original source and editing locations`,
  );
}

// Settings do not alter pure staff graphics or the underlying native model.
const staffOptions = {
  doc: source,
  page: { widthPt: 595, heightPt: 842, override: true },
  hideBarNumber: true,
};
await painter.load({
  ...staffOptions,
  view: "staff",
  accidentalMode: "explicit",
});
const staffText = painter.result!.pages.flatMap((p) => textOf(p.root));
await painter.load({
  ...staffOptions,
  view: "staff",
  accidentalMode: "measure",
});
equal(
  painter.result!.pages.flatMap((p) => textOf(p.root)),
  staffText,
  "Pure staff keeps its original accidentals under either preference",
);
await painter.load({
  ...staffOptions,
  view: "mixed",
  accidentalMode: "measure",
});
equal(
  flatCount(),
  2,
  "Mixed measure mode keeps independent grace and principal carry",
);
await painter.load({
  ...staffOptions,
  view: "mixed",
  accidentalMode: "explicit",
});
equal(flatCount(), 3, "Switching back invalidates old mixed output");
equal(
  JSON.stringify(source),
  raw,
  "Native XML with grace and source pitch remains unchanged after every view",
);
console.log(
  "Jianpu origins: ABC/JP-Word/text/123 original, expanded and mixed page outputs preserve music and IDs.",
);

// PPTX turns SMuFL marks into vector outlines. Repeated explicit flats must
// survive that serialization, including when exported from another screen view.
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: { getItem: () => null },
});
const { buildPptx } = await import("../editor/pptx");
const { unzipSync, strFromU8 } = await import("fflate");
const { toMidi } = await import("../score/midi");
const { scoreDocToMusicXml } = await import("../model/toxml");
const base = fixtures[0][1];
const midiBefore = [...toMidi(playSourceOf(base)!)];
const xmlBefore = scoreDocToMusicXml(source);
const geometryCounts: number[] = [];
for (const mode of ["explicit", "measure"] as const) {
  const style = computeStyleForPaper([THEMES.projection], {
    mode: "expanded",
    engine: "jianpu",
  });
  painter.loadSync({
    view: "expanded",
    doc: base,
    style,
    accidentalMode: mode,
  });
  const slides = unzipSync(await buildPptx(painter.pptxSource));
  const slideXml = Object.entries(slides)
    .filter(([path]) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .map(([, bytes]) => strFromU8(bytes))
    .join("");
  geometryCounts.push((slideXml.match(/<a:custGeom>/g) ?? []).length);
}
equal(
  geometryCounts[0]! - geometryCounts[1]!,
  1,
  "PPTX contains exactly the additional repeated flat outline in explicit mode",
);
equal(
  [...toMidi(playSourceOf(base)!)],
  midiBefore,
  "MIDI bytes retain the same notes and timing",
);
equal(
  scoreDocToMusicXml(source),
  xmlBefore,
  "Native XML export is unchanged by output rendering",
);
console.log(
  "Jianpu origins: PPTX vector glyphs, raw XML and MIDI outputs verified.",
);

for (const mode of ["explicit", "measure"] as const) {
  const projected = projectJianpuOutput(source, mode);
  equal(
    music(projected),
    music(source),
    `Native XML ${mode}: grace, slur and all playback pitches remain unchanged`,
  );
  equal(
    [...docView(projected).elementOf.keys()],
    [...docView(source).elementOf.keys()],
    `Native XML ${mode}: source element IDs stay aligned`,
  );
  for (const view of ["original", "expanded"] as const) {
    painter.loadSync({
      view,
      doc: source,
      style: computeStyleForPaper(
        [view === "expanded" ? THEMES.projection : THEMES.print],
        { mode: view, engine: "jianpu" },
      ),
      accidentalMode: mode,
    });
    equal(
      flatCount(),
      mode === "explicit" ? 3 : 2,
      `Native XML ${view}: requested marks survive shape projection`,
    );
  }
}

const layered = parsePu(
  "V:Inline accompaniment\nD:C\nP:4/4\nQ:1 {dsb3$ 3 |} 5 3 1 ||",
);
const layeredRaw = JSON.stringify(layered);
painter.loadSync({
  view: "original",
  doc: layered,
  style: computeStyleForPaper([THEMES.print], {
    mode: "original",
    engine: "jianpu",
  }),
  accidentalMode: "explicit",
});
equal(
  flatCount(),
  2,
  "Text-score inline voice follows the same explicit policy",
);
equal(
  JSON.stringify(layered),
  layeredRaw,
  "Nested voice source remains untouched",
);
const accompaniment = parsePu(
  "V:Inline accompaniment\nD:C\nP:4/4\nQ:1 {bz3$ 3 |} 5 3 1 ||",
);
painter.loadSync({
  view: "original",
  doc: accompaniment,
  style: computeStyleForPaper([THEMES.print], {
    mode: "original",
    engine: "jianpu",
  }),
  accidentalMode: "explicit",
});
equal(
  flatCount(),
  2,
  "Small accompaniment row renders its requested repeated flats",
);
painter.loadSync({
  view: "original",
  doc: accompaniment,
  style: computeStyleForPaper([THEMES.print], {
    mode: "original",
    engine: "jianpu",
  }),
  accidentalMode: "measure",
});
equal(
  flatCount(),
  1,
  "Small accompaniment row applies the same measure carry policy",
);
