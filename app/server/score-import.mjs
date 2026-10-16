import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rm,
  access,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";
import { DOMParser } from "@xmldom/xmldom";
import { xmlSource } from "./xml-reference.mjs";
import { structuredRuntime } from "./structured-runtime.mjs";
const run = promisify(execFile),
  root = fileURLToPath(new URL("../../", import.meta.url));
export const catalog = JSON.parse(
  await readFile(new URL("./score-sources.json", import.meta.url), "utf8"),
);
const HOSTS = new Set([
  "trillian.mit.edu",
  "www.gutenberg.org",
  "gutenberg.org",
  "raw.githubusercontent.com",
  "www.mutopiaproject.org",
]);
const MAX = 5 * 1024 * 1024,
  hash = (b) => createHash("sha256").update(b).digest("hex");
const OPENSCORE_COMMIT = "38c5db510224d9facdc4b08d741fc788cfb58ea8";
/** Index transport is injectable at the network boundary for deterministic checks. */
export function createSourceSearch(fetchIndex = fetch) {
let openScoreTree;
return async function searchSources(query = "") {
  const original = query.normalize("NFKC").toLowerCase().trim();
  const aliases = {摇篮曲:"wiegenlied",勃拉姆斯:"brahms",舒伯特:"schubert",舒曼:"schumann",贝多芬:"beethoven",肖邦:"chopin"};
  const normalized = original.replace(/摇篮曲|勃拉姆斯|舒伯特|舒曼|贝多芬|肖邦/g, word => aliases[word]);
  const curated = catalog.filter((s) =>
    (s.title + " " + s.aliases)
      .normalize("NFKC")
      .toLowerCase()
      .includes(normalized),
  );
  if (normalized.length < 2) return curated;
  if (!openScoreTree)
    openScoreTree = (async () => {
      const r = await fetchIndex(
        `https://api.github.com/repos/OpenScore/Lieder/git/trees/${OPENSCORE_COMMIT}?recursive=1`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "Nota",
          },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!r.ok) throw new Error("OpenScore 索引暂时不可用，请稍后重试。");
      const data = await r.json();
      if (data.truncated) throw new Error("在线索引不完整，暂不返回搜索结果。");
      return data.tree
        .filter(
          (e) =>
            e.type === "blob" &&
            e.path.startsWith("scores/") &&
            e.path.endsWith(".mxl"),
        )
        .map((e) => e.path);
    })().catch((e) => {
      openScoreTree = null;
      throw e;
    });
  const words = normalized
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/);
  const paths = await openScoreTree;
  const found = paths
    .filter((p) => {
      const target = p
        .replaceAll("_", " ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      return words.every((w) => target.includes(w));
    })
    .slice(0, 20)
    .map((p) => {
      const bits = p.split("/");
      return {
        title: bits[bits.length - 2].replaceAll("_", " ").slice(0,120),
        composer: bits[1].replaceAll("_", " "),
        sourceName: "OpenScore Lieder",
        aliases: p,
        edition: bits.slice(2,-2).join(" / ").replaceAll("_", " ") || "OpenScore Lieder",
        url: `https://raw.githubusercontent.com/OpenScore/Lieder/${OPENSCORE_COMMIT}/${p.split("/").map(encodeURIComponent).join("/")}`,
        license: "OpenScore Lieder · CC0-1.0",
        format: "musicxml",
        part: 0,
      };
    });
  return [
    ...curated,
    ...found.filter(
      (x) =>
        !curated.some(
          (c) =>
            decodeURIComponent(new URL(c.url).pathname) ===
            decodeURIComponent(new URL(x.url).pathname),
        ),
    ),
  ];
};
}
export const searchSources = createSourceSearch();

export function permittedSource(url) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    !HOSTS.has(u.hostname)
  )
    throw new Error(
      "请使用已支持谱库的 HTTPS 文件链接：MIT、Gutenberg、OpenScore/GitHub 或 Mutopia。",
    );
  if (
    u.hostname === "raw.githubusercontent.com" &&
    !u.pathname.startsWith("/OpenScore/")
  )
    throw new Error("当前 GitHub 文件仅支持 OpenScore 仓库。");
  return u;
}
export async function fetchScore(url) {
  for (let i = 0; i < 4; i++) {
    const u = permittedSource(url);
    const response = await fetch(u, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    if (response.status >= 300 && response.status < 400) {
      url = new URL(response.headers.get("location"), u).href;
      continue;
    }
    if (!response.ok) throw new Error(`来源下载失败（${response.status}）。`);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX) throw new Error("源谱文件超过 5 MB。");
      chunks.push(chunk);
    }
    return { bytes: Buffer.concat(chunks), url: u.href };
  }
  throw new Error("来源重定向过多。");
}
function unpack(bytes) {
  if (bytes[0] !== 80 || bytes[1] !== 75) return bytes.toString("utf8");
  const container = unzipSync(bytes, {
    filter: (f) =>
      f.name === "META-INF/container.xml" && f.originalSize < 65536,
  });
  if (!container["META-INF/container.xml"])
    throw new Error("不是有效的压缩 MusicXML。");
  const dom = new DOMParser().parseFromString(
    strFromU8(container["META-INF/container.xml"]),
    "application/xml",
  );
  const file = Array.from(dom.getElementsByTagName("rootfile"))
    .find(
      (e) =>
        !e.getAttribute("media-type") ||
        e.getAttribute("media-type") ===
          "application/vnd.recordare.musicxml+xml",
    )
    ?.getAttribute("full-path");
  if (!file) throw new Error("压缩 MusicXML 缺少主文件。");
  const files = unzipSync(bytes, {
    filter: (f) => f.name === file && f.originalSize < MAX,
  });
  if (!files[file]) throw new Error("主乐谱不存在或超过大小限制。");
  return strFromU8(files[file]);
}
export function selectAbcVoice(text, voice) {
  if (!voice) {
    if (/^V:/m.test(text)) throw new Error("多声部 ABC 请明确提供 voice。");
    return {
      text: text
        .split(/\r?\n/)
        .filter((l) => !/^w:|^W:/.test(l))
        .join("\n"),
      steps: ["仅导入旋律，移除歌词"],
    };
  }
  if (!/^[\w-]+$/.test(voice)) throw new Error("声部编号无效。");
  const headers = [],
    body = [],
    shortcuts = [];
  let active = null,
    started = false,
    found = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("U:")) shortcuts.push(line[2]);
    if (line.startsWith("X:")) {
      if (started) throw new Error("请先选择一首曲子。");
      started = true;
    }
    if (!started) continue;
    if (line.startsWith("V:")) {
      active = line.slice(2).trim().split(/\s/)[0];
      if (active === voice) found = true;
      continue;
    }
    if (active === null) {
      if (/^[XTCMLQK]:/.test(line)) headers.push(line);
    } else if (active === voice && !/^(w:|%|#)/.test(line)) {
      if (/\[V:/.test(line))
        throw new Error("暂不自动提取行内切换声部的 ABC。");
      let clean = line.replace(/"[^"]*"|![^!]*!/g, "");
      for (const c of shortcuts) clean = clean.split(c).join("");
      body.push(clean);
    }
  }
  if (!found) throw new Error("未找到指定 ABC 声部。");
  return {
    text: headers.concat(body).join("\n") + "\n",
    steps: [`选择 V:${voice}；移除歌词、文字、力度与自定义非音高装饰`],
  };
}
async function abcReference(text) {
  let uv = process.env.NOTA_UV;
  for (const p of [
    uv,
    "/opt/homebrew/bin/uv",
    path.join(homedir(), ".local/bin/uv"),
    "/usr/local/bin/uv",
  ].filter(Boolean)) {
    try {
      await access(p);
      uv = p;
      break;
    } catch {}
  }
  if (!uv)
    throw new Error("ABC 独立验证环境未就绪，请按部署说明运行 score:setup。");
  const folder = await mkdtemp(path.join(tmpdir(), "nota-abc-"));
  try {
    const file = path.join(folder, "score.abc");
    await writeFile(file, text);
    const script = fileURLToPath(
      new URL("./abc-reference.py", import.meta.url),
    );
    // No network/package installation in a request; use the verified local spike cache.
    const { stdout } = await run(
      uv,
      ["run", "--offline", "--with", "music21==10.5.0", "python", script, file],
      { timeout: 30000, maxBuffer: 2 * MAX },
    );
    const reference = JSON.parse(stdout);
    reference.spans.sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    );
    return reference;
  } catch (e) {
    const detail = String(e.stderr || e.message);
    if (detail.includes("Select a monophonic voice")) throw new Error("这个 ABC 声部包含和弦，请先选取单旋律版本再导入。");
    if (detail.includes("No module named") || detail.includes("No solution found") || detail.includes("not found")) throw new Error("ABC 独立验证环境未就绪，请按 Nota 部署说明完成设置。");
    throw new Error("ABC 独立验证未通过：暂不支持这种源谱写法，请换用单旋律版本或 MusicXML。");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
export async function prepareSource(spec, providedBytes) {
  const format = spec.format;
  if (!["abc", "musicxml"].includes(format))
    throw new Error("当前支持 ABC、MusicXML/MXL；LilyPond 尚未接入转换。");
  if (
    typeof spec.title !== "string" ||
    !spec.title.trim() ||
    spec.title.length > 120 ||
    typeof spec.license !== "string" ||
    !spec.license.trim()
  )
    throw new Error("请提供曲名和逐曲许可/出处说明。");
  const link = permittedSource(spec.url).href;
  const downloaded = providedBytes
    ? { bytes: Buffer.from(providedBytes), url: link }
    : await fetchScore(link);
  if (downloaded.bytes.length > MAX) throw new Error("源谱文件过大。");
  const digest = hash(downloaded.bytes),
    raw = unpack(downloaded.bytes);
  let selected = raw,
    reference,
    steps = [];
  if (format === "musicxml") {
    const part = Number(spec.part ?? 0);
    if (!Number.isInteger(part) || part < 0) throw new Error("声部序号无效。");
    const result = xmlSource(raw, part);
    selected = result.xml;
    reference = result.reference;
    steps = [`选择第 ${part + 1} 个旋律声部，保留原生 MusicXML`];
  } else {
    const result = selectAbcVoice(raw, spec.voice);
    selected = result.text;
    steps = result.steps;
    reference = await abcReference(selected);
  }
  const api = await structuredRuntime();
  const ready = api.prepareStructuredScore({
    text: selected,
    format,
    title: spec.title,
    reference,
  });
  const source = {
    url: downloaded.url,
    license: spec.license,
    sha256: digest,
    importedAt: new Date().toISOString(),
    validation: "source-compared",
    method:
      format === "musicxml"
        ? "MusicXML 原字段独立对照"
        : "music21 独立 ABC 解析",
    scope: ready.scope,
    part: ready.part,
    steps,
    importedTextHash: hash(ready.text),
  };
  const { reference: _reference, ...result } = ready;
  const candidate = {
    schema: "nota.score-candidate.v1",
    ...result,
    title: spec.title,
    source,
    spec: {
      title: spec.title,
      url: downloaded.url,
      license: spec.license,
      format,
      part: spec.part ?? 0,
      ...(spec.voice ? { voice: spec.voice } : {}),
    },
    originalBase64: downloaded.bytes.toString("base64"),
  };
  const directory = path.join(root, "local/source-imports");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, digest + ".source"), downloaded.bytes, {
    mode: 0o600,
  });
  return candidate;
}
export function scoreSourceMiddleware() {
  return async (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://nota.local");
    if (!url.pathname.startsWith("/api/score-sources")) return next();
    const send = (status, obj) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(JSON.stringify(obj));
    };
    try {
      const host = new URL("http://" + req.headers.host).hostname.toLowerCase();
      const allowed = (process.env.NOTA_ALLOWED_HOSTS ?? "")
        .toLowerCase()
        .split(",");
      if (host !== "localhost" && !isIP(host) && !allowed.includes(host))
        throw new Error("请通过 Nota 局域网地址访问。");
      if (req.method === "GET" && url.pathname === "/api/score-sources") {
        return send(200, await searchSources(url.searchParams.get("q") ?? ""));
      }
      if (
        req.method !== "POST" ||
        !["/api/score-sources/prepare", "/api/score-sources/validate"].includes(
          url.pathname,
        )
      )
        return send(404, { error: "未找到导入操作。" });
      if (
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      )
        return send(403, { error: "请从 Nota 页面导入。" });
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return send(415, { error: "请提供 JSON 候选。" });
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8 * MAX) throw new Error("候选文件过大。");
        chunks.push(chunk);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString());
      if (url.pathname.endsWith("/validate")) {
        if (
          data.schema !== "nota.score-candidate.v1" ||
          typeof data.originalBase64 !== "string" ||
          !data.spec
        )
          throw new Error("不是 Nota 曲谱候选文件。");
        const original = Buffer.from(data.originalBase64, "base64");
        if (hash(original) !== data.source?.sha256)
          throw new Error("原始文件哈希不匹配。");
        const live = await fetchScore(data.spec.url);
        if (hash(live.bytes) !== hash(original))
          throw new Error("在线来源已变化，请重新准备候选。");
        const candidate = await prepareSource(data.spec, live.bytes);
        if (data.text !== candidate.text || data.format !== candidate.format)
          throw new Error("候选谱文与独立源校验不一致，请重新生成候选。");
        return send(200, candidate);
      }
      const spec = data.id ? catalog.find((s) => s.id === data.id) : data;
      if (!spec) throw new Error("没有找到这个来源。");
      return send(200, await prepareSource(spec));
    } catch (e) {
      send(422, { error: e.message || "无法准备曲谱候选。" });
    }
  };
}
export function notaScoreSources() {
  const install = (s) => { s.middlewares.use(scoreSourceMiddleware()); };
  return {
    name: "nota-score-sources",
    configureServer: install,
    configurePreviewServer: install,
  };
}
