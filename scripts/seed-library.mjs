// Explicit one-time import into the running family library; never overwrites.
import { readFile, writeFile, mkdir } from "node:fs/promises";

const path = process.argv[2];
if (!path) throw new Error("用法：node scripts/seed-library.mjs <曲谱清单.json>");
const base = process.env.NOTA_URL || "http://127.0.0.1:5173";
const scores = JSON.parse(await readFile(path, "utf8"));
if (!Array.isArray(scores) || scores.some(s => !s.title || !s.text || !s.format)) throw new Error("清单缺少曲名、谱文或格式");
async function request(path = "", init) {
  const response = await fetch(`${base}/api/library${path}`, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}
const existing = await request();
await mkdir("local/qa", { recursive: true });
const report = [];
for (const score of scores) {
  const found = existing.find(s => s.title === score.title);
  if (found) { report.push({ title: score.title, id: found.id, status: "kept-existing" }); continue; }
  const { title, text, format, key, meter, presentation, project } = score;
  const saved = await request("", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, text, format, key, meter, presentation, ...(project ? { project } : {}) }) });
  const check = await request(`/${saved.id}`);
  if (check.text !== text) throw new Error(`入库回读不一致：${title}`);
  report.push({ title, id: saved.id, status: "created", sourceUnchanged: true });
}
await writeFile("local/qa/library-seed-result.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
