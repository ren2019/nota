import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(root, "out/nota-check.mjs");
await mkdir(path.dirname(output), { recursive: true });
await build({ entryPoints: [path.join(root, "src/nota/convert.check.ts")], outfile: output, bundle: true, platform: "node", format: "esm" });
await import(pathToFileURL(output).href);
const footerOutput = path.join(root, "out/nota-footer-check.mjs");
await build({ entryPoints: [path.join(root, "src/nota/export-footer.check.ts")], outfile: footerOutput, bundle: true, platform: "node", format: "esm" });
await import(pathToFileURL(footerOutput).href);
const engravingOutput = path.join(root, "out/nota-engraving-check.mjs");
await build({ entryPoints: [path.join(root, "src/nota/engraving.check.ts")], outfile: engravingOutput, bundle: true, platform: "node", format: "esm" });
await import(pathToFileURL(engravingOutput).href);

const octaveOutput = path.join(root, "out/nota-octave-check.mjs");
await build({entryPoints:[path.join(root,"src/nota/octave.check.ts")],outfile:octaveOutput,bundle:true,platform:"node",format:"esm"});
await import(pathToFileURL(octaveOutput).href);
const sourceOutput = path.join(root, "out/nota-structured-check.mjs");
await build({entryPoints:[path.join(root,"src/nota/structured-score.check.ts")],outfile:sourceOutput,bundle:true,platform:"node",format:"esm"});
await import(pathToFileURL(sourceOutput).href);
