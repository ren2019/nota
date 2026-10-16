import { recoverOctaveCandidates } from "../omr/octave-candidates";
import type { Component } from "../omrkit/types";
const assert = (v: unknown, m: string) => {
  if (!v) throw new Error(m);
};
const core = (x: number) => ({ bbox: { x, y: 276, w: 9, h: 17 } });
const point = (x: number, y: number, w = 7, h = 6): Component => ({
  id: x + y,
  bbox: { x, y, w, h },
  area: w * h,
  cx: x + w / 2,
  cy: y + h / 2,
});
const real = point(350, 269);
const cores = [core(178), core(348), core(531)];
assert(
  recoverOctaveCandidates([real], [], cores).candidates.includes(real),
  "real 7×6 high-do dot must survive local second pass",
);
assert(
  !recoverOctaveCandidates([real], [real], cores).candidates.length,
  "already classified dots must not be counted twice",
);
for (const falseDot of [
  point(365, 269),
  point(350, 230),
  point(350, 269, 1, 1),
  point(350, 269, 12, 6),
])
  assert(
    !recoverOctaveCandidates([falseDot], [], cores).candidates.length,
    "off-center, distant, tiny or oversized fragments excluded",
  );
assert(
  !recoverOctaveCandidates([real], [], cores.slice(0, 1)).candidates.length,
  "do not infer scale from an isolated fragment",
);
console.log(
  "Octave recovery: actual high-do geometry and negative fragment controls passed.",
);
