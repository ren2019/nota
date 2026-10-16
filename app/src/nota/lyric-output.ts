import type { ScoreDoc } from "../model/doc";
import { cloneWithSurface } from "../model/xmlsurface";

/** Display only. Source lyrics, native XML layout references and playback stay intact. */
export function projectLyrics(doc: ScoreDoc, show = true): ScoreDoc {
  if (show) return doc;
  const copy = cloneWithSurface(doc);
  for (const song of copy.songs) for (const part of song.parts) for (const measure of part.measures) {
    if (measure.print) delete measure.print.lyricLines;
    for (const element of measure.elements) if ("lyrics" in element) delete element.lyrics;
  }
  return copy;
}
