// Independent musical interpretation of source XML; does not call Nota's model reader.
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
const kids = (el, tag) =>
  Array.from(el?.children ?? []).filter((c) => c.localName === tag);
const one = (el, tag) => kids(el, tag)[0];
const val = (el, tag, fallback) => one(el, tag)?.textContent ?? fallback;
const num = (el, tag, fallback) => Number(val(el, tag, fallback));
const round = (n) => Math.round(n * 1e8) / 1e8;
export function xmlSource(xml, partIndex = 0) {
  if (/<!ENTITY/i.test(xml)) throw new Error("不支持包含自定义实体的 XML。");
  const dom = new DOMParser().parseFromString(xml, "application/xml");
  const root = dom.documentElement;
  if (root.localName !== "score-partwise")
    throw new Error("请使用 score-partwise MusicXML。");
  const parts = kids(root, "part"),
    part = parts[partIndex];
  if (!part) throw new Error("所选声部不存在。");
  const reference = { events: [], structure: [], spans: [] };
  const slurs = new Map();
  let divisions = 1;
  for (const [mi, m] of kids(part, "measure").entries()) {
    const attrs = one(m, "attributes");
    divisions = num(attrs, "divisions", divisions);
    if (
      !(divisions > 0) ||
      one(attrs, "transpose") ||
      kids(m, "backup").length ||
      kids(m, "forward").length
    )
      throw new Error("暂不自动导入移调乐器、重叠声部或跳步时间线。");
    const events = [];
    let at = 0;
    const voices = new Set();
    for (const n of kids(m, "note")) {
      voices.add(val(n, "voice", "1"));
      if (voices.size > 1 || one(n, "chord") || one(n, "unpitched"))
        throw new Error("请选取单旋律声部。");
      const p = one(n, "pitch"),
        grace = !!one(n, "grace"),
        duration = grace ? 0 : round(num(n, "duration", NaN) / divisions);
      const step = val(p, "step", ""),
        octave = num(p, "octave", NaN),
        alter = num(p, "alter", 0);
      if (
        p &&
        (!"CDEFGAB".includes(step) ||
          !step ||
          !Number.isInteger(octave) ||
          !Number.isInteger(alter))
      )
        throw new Error("不支持的音高。");
      const midi = p
        ? 12 * (octave + 1) +
          [0, 2, 4, 5, 7, 9, 11]["CDEFGAB".indexOf(step)] +
          alter
        : null;
      if ((!p && !one(n, "rest")) || !Number.isFinite(duration) || duration < 0)
        throw new Error("音符或时值无效。");
      const ties = kids(n, "tie").map((t) => t.getAttribute("type"));
      events.push({
        midi,
        quarters: duration,
        grace,
        tieStart: ties.includes("start"),
        tieStop: ties.includes("stop"),
      });
      for (const s of kids(one(n, "notations"), "slur")) {
        const key = s.getAttribute("number") || "1",
          type = s.getAttribute("type");
        if (type === "start") slurs.set(key, `${mi}:${round(at)}`);
        if (type === "stop") {
          const start = slurs.get(key);
          if (!start) throw new Error("连线起止不完整。");
          reference.spans.push({
            type: "slur",
            start,
            end: `${mi}:${round(at + duration)}`,
          });
          slurs.delete(key);
        }
      }
      at += duration;
    }
    // Whole-bar rest and split rests have the same silence; never merge repeated notes.
    const restMerged = [];
    for (const e of events) {
      const last = restMerged.at(-1);
      if (e.midi === null && !e.grace && last?.midi === null && !last.grace)
        last.quarters = round(last.quarters + e.quarters);
      else restMerged.push(e);
    }
    reference.events.push(restMerged);
    for (const b of kids(m, "barline")) {
      const repeat = one(b, "repeat"),
        ending = one(b, "ending");
      if (!repeat && !ending) continue;
      reference.structure.push({
        measure: mi + 1,
        location: b.getAttribute("location") || "right",
        ...(repeat ? { repeat: repeat.getAttribute("direction") } : {}),
        ...(repeat?.hasAttribute("times")
          ? { times: Number(repeat.getAttribute("times")) }
          : {}),
        ...(ending
          ? {
              ending: {
                numbers: (ending.getAttribute("number") || "")
                  .split(/\D+/)
                  .filter(Boolean)
                  .map(Number),
                type: ending.getAttribute("type"),
              },
            }
          : {}),
      });
    }
  }
  if (slurs.size) throw new Error("连线起止不完整。");
  reference.spans.sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
  for (const p of parts) if (p !== part) root.removeChild(p);
  for (const e of Array.from(one(root, "part-list")?.children ?? []))
    if (
      e.localName !== "score-part" ||
      e.getAttribute("id") !== part.getAttribute("id")
    )
      e.parentNode.removeChild(e);
  return { xml: new XMLSerializer().serializeToString(dom), reference };
}
