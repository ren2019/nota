import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { loadScoreDoc } from "../model/fromxml";
import { docView } from "../pu/slots";
import { projectJianpuOutput } from "./jianpu-output";

Object.defineProperty(globalThis, "DOMParser", {
  configurable: true,
  value: DOMParser,
});
Object.defineProperty(globalThis, "XMLSerializer", { configurable: true, value: XMLSerializer });
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

for (const [name, doc] of fixtures) {
  const mixed = loadScoreDoc(scoreDocToMusicXml(doc, { sourceIds: true }));
  const before = JSON.stringify(mixed);
  const sourceIds = doc.songs.flatMap((song) =>
    song.parts.flatMap((part) =>
      part.measures.flatMap((m) => m.elements.map((e) => e.id)),
    ),
  );
  const mapped = mixed.songs.flatMap((song) =>
    song.parts.flatMap((part) =>
      part.measures.flatMap((m) =>
        m.elements.flatMap((e) =>
          e.kind === "chord" && e.srcId !== undefined ? [e.srcId] : [],
        ),
      ),
    ),
  );
  if (!mapped.length || mapped.some((id) => !sourceIds.includes(id)))
    throw new Error(
      `${name}: mixed source IDs must reference the original editable elements`,
    );
  await painter.load({
    view: "staff",
    doc: mixed,
    page: { widthPt: 595, heightPt: 842, override: true },
    hideBarNumber: true,
  });
  const staffFlats = flatCount();
  for (const mode of ["explicit", "measure"] as const) {
    await painter.load({
      view: "mixed",
      doc: mixed,
      page: { widthPt: 595, heightPt: 842, override: true },
      hideBarNumber: true,
      accidentalMode: mode,
    });
    equal(
      flatCount() - staffFlats,
      mode === "explicit" ? 2 : 1,
      `${name}: derived mixed preview uses the same mode`,
    );
  }
  equal(
    JSON.stringify(mixed),
    before,
    `${name}: derived mixed music and source mapping stay unchanged`,
  );
}
console.log(
  "Jianpu origins: every supported origin retains mixed-view editing source mappings.",
);

// A mixed output preference must retain the native staff surface, not rerun
// automatic layout after losing WeakMap-bound coordinates and fonts.
const surfaceXml = xml.replace('<measure number="1">', '<measure number="1" width="417">').replace(/<octave>4<\/octave>/g, '<octave>5</octave>').replace('<type>quarter</type>', '<type>quarter</type><stem>up</stem><lyric><text font-family="Serif" font-size="19">啊</text></lyric>');
const surfaceDoc = loadScoreDoc(surfaceXml);
const surfaceRaw = JSON.stringify(surfaceDoc);
const surfaceNative = scoreDocToMusicXml(surfaceDoc);
for (const mode of ["explicit", "measure"] as const) {
  await painter.load({ view: "mixed", doc: surfaceDoc, page: null, hideBarNumber: true, accidentalMode: mode });
  const score = painter.result!.staffPlacements[0]!.score;
  equal(score.autoLayout, false, `${mode}: mixed preserves embedded native layout`);
  equal(score.measures[0]!.width, 417, `${mode}: native measure width is retained`);
  const measure = score.parts[0]!.measures[0]!;
  equal(measure.chords.find(c => !c.grace)!.stemUp, true, `${mode}: explicit native stem direction is retained`);
  equal(measure.lyrics[0]!.font.family, "Serif", `${mode}: native lyric font survives projection`);
  equal(Math.round(measure.lyrics[0]!.font.size * score.scaling), 19, `${mode}: native lyric font size survives projection`);
}
equal(JSON.stringify(surfaceDoc), surfaceRaw, "Mixed projection preserves native editable source");
equal(scoreDocToMusicXml(surfaceDoc), surfaceNative, "Mixed layout never modifies native XML surface nodes");

const chordNote = (alter: number, octave: number, extra = "") => `<note>${extra}<pitch><step>E</step><alter>${alter}</alter><octave>${octave}</octave></pitch><duration>1</duration><type>quarter</type></note>`;
const chordXml = `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time></attributes>${chordNote(-1, 5)}${chordNote(0, 5)}${chordNote(-1, 4, "<chord/>")}${chordNote(-1, 5)}</measure></part></score-partwise>`;
const chordSource = loadScoreDoc(chordXml);
const chordMusic = music(chordSource);
await painter.load({ view: "staff", doc: chordSource, page: null, hideBarNumber: true });
const chordStaffFlats = flatCount();
for (const mode of ["explicit", "measure"] as const) {
  const output = projectJianpuOutput(chordSource, mode);
  equal(visible(output), ["flat", "natural", "flat"], `${mode}: hidden chord tone never changes the visible melody carry`);
  equal(music(output), chordMusic, `${mode}: every chord tone and principal pitch stays intact`);
  for (const view of ["original", "expanded", "mixed"] as const) {
    if (view === "mixed") await painter.load({ view, doc: chordSource, page: null, hideBarNumber: true, accidentalMode: mode });
    else painter.loadSync({ view, doc: chordSource, style: null, accidentalMode: mode });
    equal(flatCount(), view === "mixed" ? chordStaffFlats + 2 : 2, `${mode}/${view}: required final melody flat is printed`);
  }
}

// Footer descriptions are kept in the raw model and emitted metadata, while
// the page header shows only real titles and author credits.
const footerDoc = parse123("T:来源排版检查\nT:单段旋律 · 依 AirDrop 原图校正\nT:保留的普通副标题\nC:保留的作者\nK:1=C\nM:4/4\n1 2 3 4 |]");
const footerRaw = JSON.stringify(footerDoc);
const footerMusic = [...toMidi(playSourceOf(footerDoc)!)];
for (const view of ["original", "expanded"] as const) {
  painter.loadSync({ view, doc: footerDoc, style: computeStyleForPaper([view === "expanded" ? THEMES.projection : THEMES.print], { mode: view, engine: "jianpu" }) });
  const text = painter.result!.pages.flatMap(p => textOf(p.root));
  if (text.includes("单段旋律 · 依 AirDrop 原图校正")) throw new Error("Version/source text must not remain a large subtitle");
  if (!text.includes("保留的普通副标题")) throw new Error("Ordinary subtitle must remain in the header");
  if (!text.some(t => t.includes("保留的作者"))) throw new Error("Author credit must remain in the header");
  equal(painter.footerSource(0), "单段旋律 · 依 AirDrop 原图校正", "Source follows rendered pages");
}
const footerDeck = unzipSync(await buildPptx(painter.pptxSource, 0xffffffff, { options: { brand: true, date: true, pageNumbers: true }, date: "2026-10-16" }));
const footerSlide = strFromU8(footerDeck["ppt/slides/slide1.xml"]!);
if (!footerSlide.includes("A simple way to make sheet music.") || !footerSlide.includes("单段旋律 · 依 AirDrop 原图校正")) throw new Error("PPTX must include the shared slogan and source footer");
if (!/algn="r"/.test(footerSlide) || !/algn="l"/.test(footerSlide)) throw new Error("PPTX footer columns must use left and right alignment");
equal(JSON.stringify(footerDoc), footerRaw, "Footer projection preserves raw model/source/IDs");
equal([...toMidi(playSourceOf(footerDoc)!)], footerMusic, "Footer projection preserves actual music playback");
const savedSource = parse123("T:持久来源\nI:meta source 公开谱集 · 校对说明\nK:1=C\nM:4/4\n1 2 3 4 |]");
const { scoreFooterSource } = await import("./score-footer-source");
equal(scoreFooterSource(loadScoreDoc(scoreDocToMusicXml(savedSource)).songs[0]), "公开谱集 · 校对说明", "Source metadata survives MusicXML serialization/reopening");
console.log("Export footer: rendered headers, PPTX branding/source, source round-trip and music preserved.");
const sourceBook = parse123("X:1\nT:第一首\nI:meta source 第一来源\nK:1=C\nM:4/4\n1 2 3 4 |]\nX:2\nT:第二首\nI:meta source 第二来源\nK:1=C\nM:4/4\n5 6 7 1' |]");
painter.loadSync({ view: "original", doc: sourceBook, style: null });
equal(painter.pageCount, 1, "Continuous tunebook remains one long page");
equal(painter.footerSource(0), "第一来源 · 第二来源", "All songs in a continuous page retain their sources");

// Exercise the same fixed-page cap through real OOXML serialization.
const giantDescription = "来源说明".repeat(1000);
const giantFooterDoc = parse123(`T:超长来源\nI:meta source ${giantDescription}\nK:1=C\nM:4/4\n1 2 3 4 |]`);
painter.loadSync({ view: "expanded", doc: giantFooterDoc, style: computeStyleForPaper([THEMES.projection], { mode: "expanded", engine: "jianpu" }) });
const boundedDeck = unzipSync(await buildPptx(painter.pptxSource, 0xffffffff, { options: { brand: true, date: true, pageNumbers: true }, date: "2026-10-16" }));
for (const [path, bytes] of Object.entries(boundedDeck).filter(([path]) => /^ppt\/slides\/slide\d+\.xml$/.test(path))) {
  const slide = strFromU8(bytes);
  if (!slide.includes("…")) throw new Error(`${path}: extreme source must show an ellipsis`);
  if (!slide.includes("A simple way to make sheet music.")) throw new Error(`${path}: normal paper keeps the complete slogan`);
  const xml = new DOMParser().parseFromString(slide, "application/xml");
  for (const shape of Array.from(xml.getElementsByTagName("p:sp"))) {
    const off = shape.getElementsByTagName("a:off")[0], ext = shape.getElementsByTagName("a:ext")[0];
    if (!off || !ext) continue;
    const x = Number(off.getAttribute("x")), y = Number(off.getAttribute("y"));
    const width = Number(ext.getAttribute("cx")), height = Number(ext.getAttribute("cy"));
    if (width < 0 || height < 0) throw new Error(`${path}: exported shapes must never have negative dimensions`);
    if (Array.from(shape.getElementsByTagName("a:rPr")).some(pr => pr.getAttribute("sz") === "750") &&
      (x < 0 || y < 0 || x + width > painter.pageWidth * 12700 || y + height > painter.pageHeight * 12700)) throw new Error(`${path}: footer text must stay inside the page`);
  }
}
equal(scoreFooterSource(giantFooterDoc.songs[0]), giantDescription, "Abbreviated exports preserve the complete source in the editable model");
console.log("Export footer: extreme sources bounded in actual PPTX, complete metadata retained.");

// Actual exported decks embed the monochrome symbol and keep the two rows in
// reading order under every existing setting combination.
const twoRowDoc = parse123("T:两行页脚\nI:meta source 公开谱集\nK:1=C\nM:4/4\n1 2 3 4 |]");
painter.loadSync({ view: "expanded", doc: twoRowDoc, style: computeStyleForPaper([THEMES.projection], { mode: "expanded", engine: "jianpu" }) });
for (const brand of [false, true]) for (const date of [false, true]) for (const pageNumbers of [false, true]) {
  const bytes = await buildPptx(painter.pptxSource, 0xffffffff, { options: { brand, date, pageNumbers }, date: "2026-10-16" });
  const deck = unzipSync(bytes);
  const xml = new DOMParser().parseFromString(strFromU8(deck["ppt/slides/slide1.xml"]!), "application/xml");
  const shapes = Array.from(xml.getElementsByTagName("p:sp"));
  const markShapes = shapes.filter(shape => shape.getElementsByTagName("a:custGeom").length && Array.from(shape.getElementsByTagName("a:srgbClr")).some(c => c.getAttribute("val") === "888888"));
  equal(markShapes.length, brand ? 3 : 0, "PPTX embeds the three vector paths of the monochrome Nota symbol only when branding is enabled");
  const footerShapes = shapes.filter(shape => Array.from(shape.getElementsByTagName("a:rPr")).some(pr => pr.getAttribute("sz") === "750"));
  const label = (text: string) => footerShapes.find(shape => shape.getElementsByTagName("a:t")[0]?.textContent === text);
  const sourceLabel = label("公开谱集");
  if (!sourceLabel) throw new Error("Source remains visible under all brand/date/page options");
  const position = (shape: typeof shapes[number]) => {
    const offset = shape.getElementsByTagName("a:off")[0]!;
    return { x: Number(offset.getAttribute("x")), y: Number(offset.getAttribute("y")) };
  };
  const metaLabel = [date ? "2026-10-16" : "", pageNumbers ? `1 / ${painter.pageCount}` : ""].filter(Boolean).join(" · ");
  const metaShape = metaLabel ? label(metaLabel) : undefined;
  if (metaLabel && (!metaShape || position(metaShape).y !== position(sourceLabel).y)) throw new Error("Date and pages share the source's first-row baseline");
  const brandLabel = label("Nota · A simple way to make sheet music.");
  const brandPrefix = label("Typeset with");
  if (!!brandLabel !== brand) throw new Error("Brand setting controls both brand and exact slogan");
  if (brandLabel) {
    if (position(brandLabel).y <= position(sourceLabel).y) throw new Error("Brand row follows the source/date row");
    if (!brandPrefix || position(brandPrefix).x !== position(sourceLabel).x) throw new Error("Typeset with begins the brand row at the source left edge");
    for (const mark of markShapes) {
      const p = position(mark);
      if (!brandPrefix || p.x <= position(brandPrefix).x || p.x >= position(brandLabel).x) throw new Error("Logo is embedded between Typeset with and Nota");
      const ext = mark.getElementsByTagName("a:ext")[0]!;
      const w = Number(ext.getAttribute("cx")), h = Number(ext.getAttribute("cy"));
      if (p.x < 0 || p.y < 0 || p.x + w > painter.pageWidth * 12700 || p.y + h > painter.pageHeight * 12700) throw new Error("Embedded logo remains inside the physical slide");
    }
  }
}
console.log("Export footer: all eight PPTX setting combinations preserve two-tier alignment and embedded monochrome logo.");
