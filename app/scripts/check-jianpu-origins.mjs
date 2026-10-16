import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const output = `${root}/out/nota-jianpu-origins.mjs`;
await build({
  entryPoints: [`${root}/src/nota/jianpu-origins.check.ts`],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["@xmldom/xmldom"],
  define: { "import.meta.env.BASE_URL": '"/"' },
});
const originalFetch = globalThis.fetch;
const globals = ["DOMParser", "document", "localStorage"].map((key) => [
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
  await import(pathToFileURL(output).href);
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}
