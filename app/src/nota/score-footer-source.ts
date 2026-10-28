import type { ScoreDoc, Song } from "../model/doc";
import { cloneWithSurface } from "../model/xmlsurface";
import { getMeta } from "../model/metakeys";
import type { SourceProvenance } from "./source-import";
import { t } from '../i18n';

// Exact compatibility for the verified historical version/source description.
// It remains in the editable original; ordinary subtitles are never inferred.
const LEGACY_DESCRIPTION = "单段旋律 · 依 AirDrop 原图校正";

/** Existing I:meta source (MusicXML miscellaneous-field) is the durable source
 * representation. Never print internal validation, timestamps or hashes. */
export function scoreFooterSource(song: Song | undefined): string {
  if (!song) return "";
  return [...getMeta(song, "source"), ...song.work.subtitles.filter(text => text === LEGACY_DESCRIPTION)]
    .filter((text, index, all) => text.trim() && all.indexOf(text) === index).join(" · ");
}

export function provenanceFooterSource(source: SourceProvenance | undefined): string {
  return source ? [source.url, source.license].filter(Boolean).join(" · ") : "";
}

/** A source URL is provenance, not proof that the current score matches it. */
export function provenanceStatus(source: SourceProvenance | undefined): string {
  if (!source) return '';
  if (source.edited) return t('nota.ia.onlineImportEdited');
  return source.validation === 'source-compared' ? t('nota.ia.onlineImportComparedOnImport') : t('nota.ia.sourceRecordedUnverified');
}

/** Display-only projection. Keeps music, source offsets and raw source intact. */
export function projectScoreFooter(doc: ScoreDoc): ScoreDoc {
  if (!doc.songs.some(song => song.work.subtitles.includes(LEGACY_DESCRIPTION))) return doc;
  const copy = cloneWithSurface(doc);
  for (const song of copy.songs) {
    if (!song.work.subtitles.includes(LEGACY_DESCRIPTION)) continue;
    song.work.subtitles = song.work.subtitles.filter(text => text !== LEGACY_DESCRIPTION);
    if (song.credits) song.credits = song.credits.filter(c => !(c.type === "subtitle" && c.text === LEGACY_DESCRIPTION));
  }
  return copy;
}
