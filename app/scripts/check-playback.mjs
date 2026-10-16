import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(root, "out/nota-playback-check.mjs");
await build({
  entryPoints: [path.join(root, "src/nota/playback.check.ts")],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  define: { "import.meta.env.BASE_URL": '"/"' },
  plugins: [
    {
      name: "fake-audio-sampler",
      setup(b) {
        b.onResolve({ filter: /^smplr$/ }, () => ({
          path: path.join(root, "scripts/fixtures/sampler.mjs"),
        }));
      },
    },
  ],
});
await import(pathToFileURL(output).href);
