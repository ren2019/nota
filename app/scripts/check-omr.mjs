import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
const app = fileURLToPath(new URL("..", import.meta.url)),
  root = path.dirname(app),
  out = path.join(app, "out/nota-omr-check.mjs");
await build({
  entryPoints: [path.join(app, "src/cli/omr.ts")],
  outfile: out,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
process.env.OMR_MODELS = path.join(app, "public/redist/ocr");
const api = await import(pathToFileURL(out));
const { score } = await api.recognizeMusicppDetailed(
  await readFile(path.join(root, "local/test-cases/IMG_4548.JPG")),
);
const targets = [
  [0, 348],
  [0, 531],
  [1, 400],
  [2, 22],
  [2, 96],
  [3, 24],
  [3, 270],
];
for (const [row, x] of targets) {
  const n = score.rows[row].nums.find((n) => n.bbox.x === x);
  assert.equal(n?.digit, 1);
  assert.equal(n?.octave, 1);
}
const recovered = score.rows[0].nums.find((n) => n.bbox.x === 348);
assert(recovered.doubt.includes("oct.recovered"));
assert(recovered.octaveEvidence.candidates.length);
const clean = await api.recognizeMusicppDetailed(
  await readFile(path.join(root, "local/qa/renotate-c.png")),
);
const before = JSON.parse(
  await readFile(
    path.join(root, "local/spikes/001-octave/clean-control-trace.json"),
  ),
);
const musical = (s) =>
  s.rows.map((r) =>
    r.nums.map((n) => [
      n.digit,
      n.octave,
      n.div,
      n.dot,
      n.augment,
      n.accidental,
    ]),
  );
assert.deepEqual(musical(clean.score), musical(before));
await writeFile(
  path.join(root, "local/qa/integrated-omr-result.json"),
  JSON.stringify(
    {
      highDos: "7/7",
      recovered: recovered.octaveEvidence,
      requiresReview: recovered.doubt,
      cleanUnchanged: true,
      wholeScoreAccuracy: "not passed",
    },
    null,
    2,
  ),
);
console.log(
  "OMR: 7/7 high dos, recovered dots require source review, clean control unchanged. Whole score is not yet fully correct.",
);
