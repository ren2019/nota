import type { PathSeg } from "../layout/pageitem";

// The N/note mark from public/favicon.svg, without its colored square.
// Both export adapters consume this one geometry definition. Coordinates are
// cropped to the original symbol's ink envelope (9,13.5)–(49,52.5).
export const NOTA_MARK_RATIO = 40 / 39;
export interface NotaMarkPath { segs: PathSeg[]; fill: boolean; strokeWidth: number }

function ellipse(cx: number, cy: number): PathSeg[] {
  const k = 0.5522847498307936, rx = 7.5, ry = 5;
  const rotation = -22 * Math.PI / 180;
  const p = (x: number, y: number) => [cx + x * Math.cos(rotation) - y * Math.sin(rotation), cy + x * Math.sin(rotation) + y * Math.cos(rotation)];
  return [
    { op: "M", pts: p(rx, 0) },
    { op: "C", pts: [...p(rx, k * ry), ...p(k * rx, ry), ...p(0, ry)] },
    { op: "C", pts: [...p(-k * rx, ry), ...p(-rx, k * ry), ...p(-rx, 0)] },
    { op: "C", pts: [...p(-rx, -k * ry), ...p(-k * rx, -ry), ...p(0, -ry)] },
    { op: "C", pts: [...p(k * rx, -ry), ...p(rx, -k * ry), ...p(rx, 0)] },
    { op: "Z", pts: [] },
  ];
}
const MARK_PATHS: NotaMarkPath[] = [
  { segs: [{ op: "M", pts: [21, 45] }, { op: "L", pts: [21, 18] }, { op: "L", pts: [46, 43] }, { op: "L", pts: [46, 16] }], fill: false, strokeWidth: 5 },
  { segs: ellipse(16.5, 46.5), fill: true, strokeWidth: 0 },
  { segs: ellipse(41.5, 44.5), fill: true, strokeWidth: 0 },
];

/** Local physical-point geometry; embeds no fonts or external resources. */
export function notaMarkPaths(height: number): NotaMarkPath[] {
  const scale = height / 39;
  return MARK_PATHS.map(path => ({ ...path, strokeWidth: path.strokeWidth * scale,
    segs: path.segs.map(segment => ({ op: segment.op, pts: segment.pts.map((value, index) => (value - (index % 2 === 0 ? 9 : 13.5)) * scale) })),
  }));
}
