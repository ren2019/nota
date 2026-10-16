import { writeFile, readFile } from "node:fs/promises";
import { catalog, prepareSource } from "../app/server/score-import.mjs";
const args = process.argv.slice(2),
  opts = {};
for (let i = 0; i < args.length; i += 2) {
  if (!args[i].startsWith("--") || !args[i + 1])
    throw new Error(
      "参数格式为 --id usa --out local/usa.nota-score.json，或 --url URL --title 曲名 --license 许可 --format abc|musicxml",
    );
  opts[args[i].slice(2)] = args[i + 1];
}
const spec = opts.id
  ? catalog.find((s) => s.id === opts.id)
  : { ...opts, part: Number(opts.part ?? 0) };
if (!spec) throw new Error("来源编号不存在。");
const candidate = await prepareSource(spec);
const output = opts.out ?? `local/${opts.id ?? "candidate"}.nota-score.json`;
await writeFile(output, JSON.stringify(candidate, null, 2));
const checked = JSON.parse(await readFile(output, "utf8"));
if (checked.source.sha256 !== candidate.source.sha256)
  throw new Error("候选回读失败。");
console.log(
  JSON.stringify(
    {
      file: output,
      title: candidate.title,
      format: candidate.format,
      notes: candidate.notes,
      measures: candidate.measures,
      source: candidate.source.url,
      status: "候选已生成，尚未入库",
    },
    null,
    2,
  ),
);
