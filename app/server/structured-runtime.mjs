import { build } from "esbuild";
import { DOMParser } from "@xmldom/xmldom";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
let pending;
export function structuredRuntime() {
  if (!pending)
    pending = (async () => {
      const root = fileURLToPath(new URL("..", import.meta.url));
      const output = path.join(root, "out/nota-structured.mjs");
      await build({
        entryPoints: [path.join(root, "src/nota/structured-score.ts")],
        outfile: output,
        bundle: true,
        platform: "node",
        format: "esm",
      });
      globalThis.DOMParser ??= DOMParser;
      return import(pathToFileURL(output).href + "?v=" + Date.now());
    })().catch((e) => {
      pending = null;
      throw e;
    });
  return pending;
}
