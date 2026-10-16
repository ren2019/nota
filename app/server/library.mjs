import { mkdir, readdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FORMATS = new Set(["123", "jpwabc", "pu", "abc", "musicxml", "jly", "jcx"]);
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BYTES = 48 * 1024 * 1024;
const defaultDirectory = fileURLToPath(new URL("../../local/library/", import.meta.url));

function fail(status, message) { return Object.assign(new Error(message), { status }); }
const summary = ({ text: _text, project: _project, presentation: _presentation, ...metadata }) => metadata;

/** Shared by Vite dev and preview. Scores live on the Nota host, not in a browser. */
export function libraryMiddleware(directory = defaultDirectory) {
  const allowedHosts = (process.env.NOTA_ALLOWED_HOSTS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  let writes = Promise.resolve();
  const file = (id) => path.join(directory, `${id}.json`);
  const load = async (id) => {
    try { return JSON.parse(await readFile(file(id), "utf8")); }
    catch (e) { if (e.code === "ENOENT") throw fail(404, "这份曲谱不存在或已被移动。"); throw e; }
  };
  const serialize = (work) => {
    const result = writes.then(work);
    writes = result.catch(() => {});
    return result;
  };
  return async (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://nota.local");
    if (!url.pathname.startsWith("/api/library")) return next();
    const send = (status, value) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      res.end(JSON.stringify(value));
    };
    try {
      const host = new URL(`http://${req.headers.host ?? ""}`).hostname.toLowerCase();
      if (host !== "localhost" && !isIP(host.replace(/^\[|\]$/g, "")) && !allowedHosts.includes(host)) throw fail(403, "请通过已配置的 Nota 地址访问曲谱库。");
      const match = /^\/api\/library(?:\/([^/]+))?\/?$/.exec(url.pathname);
      if (!match || (match[1] && !ID.test(match[1]))) throw fail(404, "未找到曲谱。");
      const id = match[1];
      if (req.method === "GET") {
        if (id) return send(200, await load(id));
        let names;
        try { names = await readdir(directory); }
        catch (e) { if (e.code === "ENOENT") return send(200, []); throw e; }
        const records = await Promise.all(names.filter((name) => ID.test(name.replace(/\.json$/, "")) && name.endsWith(".json"))
          .map(async (name) => {
            try { return summary(JSON.parse(await readFile(path.join(directory, name), "utf8"))); }
            catch (error) { if (error.code === "ENOENT") return null; throw error; }
          }));
        return send(200, records.filter(Boolean).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      }
      if ((req.method !== "POST" || id) && (req.method !== "PUT" || !id) && (req.method !== "DELETE" || !id)) throw fail(405, "不支持此操作。");
      if (!req.headers["content-type"]?.startsWith("application/json")) throw fail(415, "保存内容格式不正确。");
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw fail(403, "请从 Nota 页面保存曲谱。");
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BYTES) throw fail(413, "这份曲谱较大，请减少原图后再保存。");
        chunks.push(chunk);
      }
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { throw fail(400, "保存内容格式不正确。"); }
      if (req.method === "DELETE") {
        if (!Number.isSafeInteger(data?.revision) || data.revision < 1) throw fail(400, "请提供有效的曲谱修订版本。");
        const deleted = await serialize(async () => {
          const previous = await load(id);
          if (data.revision !== previous.revision) throw fail(409, "其他人刚刚更新了这份曲谱，尚未删除。请重新打开后确认。");
          await unlink(file(id));
          return { id, revision: previous.revision, deleted: true };
        });
        return send(200, deleted);
      }
      if (!data || typeof data.title !== "string" || !data.title.trim() || data.title.trim().length > 120 ||
          !FORMATS.has(data.format) || typeof data.text !== "string" || !data.text.trim() ||
          (data.project !== undefined && (typeof data.project !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(data.project)))) {
        throw fail(400, "请填写曲名，并提供有效的曲谱内容。");
      }
      const saved = await serialize(async () => {
        const previous = id ? await load(id) : null;
        if (previous && data.revision !== previous.revision) throw fail(409, "其他人刚刚更新了这份曲谱，请重新打开，或另存一份。");
        const now = new Date().toISOString();
        const record = {
          id: id ?? randomUUID(), title: data.title.trim(), format: data.format, text: data.text,
          key: typeof data.key === "string" ? data.key.slice(0, 24) : "",
          meter: typeof data.meter === "string" ? data.meter.slice(0, 24) : "",
          createdAt: previous?.createdAt ?? now, updatedAt: now, revision: (previous?.revision ?? 0) + 1,
          ...(data.project ? { project: data.project } : {}),
          ...(data.source && typeof data.source === "object" ? { source: {
            ...Object.fromEntries(["url", "license", "sha256", "importedAt", "validation", "method", "scope", "part", "importedTextHash"].map(k => [k, String(data.source[k] ?? "").slice(0, 2048)])),
            edited: createHash("sha256").update(data.text).digest("hex") !== data.source.importedTextHash,
          }} : {}),
          ...(data.presentation && typeof data.presentation === "object" ? { presentation: data.presentation } : {}),
        };
        await mkdir(directory, { recursive: true });
        const temporary = path.join(directory, `${record.id}.${randomUUID()}.tmp`);
        await writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
        await rename(temporary, file(record.id));
        return summary(record);
      });
      send(id ? 200 : 201, saved);
    } catch (e) {
      send(e.status ?? 500, { error: e.status ? e.message : "暂时无法读写曲谱库，请检查 Nota 服务后重试。" });
    }
  };
}

export function notaLibrary(directory) {
  const install = (server) => { server.middlewares.use(libraryMiddleware(directory)); };
  return { name: "nota-shared-library", configureServer: install, configurePreviewServer: install };
}
