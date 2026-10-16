import { build } from "esbuild";
import { mkdir, readFile } from "node:fs/promises";
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
const jianpuOutput = path.join(root, "out/nota-jianpu-output-check.mjs");
await build({ entryPoints: [path.join(root, "src/nota/jianpu-output.check.ts")], outfile: jianpuOutput, bundle: true, platform: "node", format: "esm" });
await import(pathToFileURL(jianpuOutput).href);
const textOutput = path.join(root, "out/nota-text-output-check.mjs");
await build({ entryPoints: [path.join(root, "src/nota/text-output.check.ts")], outfile: textOutput, bundle: true, platform: "node", format: "esm" });
await import(pathToFileURL(textOutput).href);

const octaveOutput = path.join(root, "out/nota-octave-check.mjs");
await build({entryPoints:[path.join(root,"src/nota/octave.check.ts")],outfile:octaveOutput,bundle:true,platform:"node",format:"esm"});
await import(pathToFileURL(octaveOutput).href);
const sourceOutput = path.join(root, "out/nota-structured-check.mjs");
await build({entryPoints:[path.join(root,"src/nota/structured-score.check.ts")],outfile:sourceOutput,bundle:true,platform:"node",format:"esm"});
await import(pathToFileURL(sourceOutput).href);

const settingsOutput = path.join(root, "out/nota-output-settings-check.mjs");
await build({ entryPoints: [path.join(root, "src/nota/output-settings.check.ts")], outfile: settingsOutput, bundle: true, platform: "node", format: "esm" });
await import(pathToFileURL(settingsOutput).href);

const originsOutput = `${root}/out/nota-jianpu-origins.mjs`;
await build({
  entryPoints: [`${root}/src/nota/jianpu-origins.check.ts`],
  outfile: originsOutput,
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["@xmldom/xmldom"],
  define: { "import.meta.env.BASE_URL": '"/"' },
});
const originalFetch = globalThis.fetch;
const globals = ["DOMParser", "XMLSerializer", "document", "localStorage"].map((key) => [
  key,
  Object.getOwnPropertyDescriptor(globalThis, key),
]);
globalThis.fetch = async (input, ...args) => {
  if (
    input === "/redist/Bravura.otf" ||
    input === "/redist/bravura_metadata.json"
  )
    return new Response(await readFile(`${root}/public${input}`));
  return originalFetch(input, ...args);
};
try {
  await import(pathToFileURL(originsOutput).href);
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}
