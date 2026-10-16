import type { Component, Rect } from "../omrkit/types";
import { rcx, rbottom } from "../omrkit/types";
import { median } from "../omrkit/geom";

/** Second pass for dots rejected by the page-wide size estimate. Existing
 * buildJpNums still decides ownership, text/arc exclusion and stacked octaves.
 * Keep this local to a row: widening the global pool also turns lyrics into dots.
 */
export function recoverOctaveCandidates(
  components: readonly Component[],
  dots: readonly Component[],
  cores: readonly { bbox: Rect }[],
): { candidates: Component[]; height: number } {
  const height = median(cores.map((c) => c.bbox.h));
  if (cores.length < 3 || height < 6) return { candidates: [], height };
  const known = new Set(dots);
  return {
    height,
    candidates: components.filter((k) => {
      if (known.has(k)) return false;
      const b = k.bbox;
      if (
        b.w > height * 0.45 ||
        b.h > height * 0.45 ||
        b.w < height * 0.12 ||
        b.h < height * 0.12 ||
        b.w + b.h < height * 0.3
      )
        return false;
      return cores.some(
        (n) =>
          Math.abs(rcx(n.bbox) - rcx(b)) <= height * 0.25 &&
          n.bbox.y - rbottom(b) >= -1 &&
          n.bbox.y - rbottom(b) < height * 0.8,
      );
    }),
  };
}
