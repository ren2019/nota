import { mkdir, readdir, readFile, writeFile, rename } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authorizeToolRequest } from "./tool-access.mjs";
import { checkSubmission, synchronizeProject } from "./submission-runtime.mjs";
import { normalizeSourceProvenance } from "../../cli/source-provenance.mjs";

const FORMATS = new Set(["123", "jpwabc", "pu", "abc", "musicxml", "jly", "jcx"]);
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BYTES = 48 * 1024 * 1024;
const defaultDirectory = fileURLToPath(new URL("../../local/library/", import.meta.url));

function fail(status, message) { return Object.assign(new Error(message), { status }); }
const summary = ({ text: _text, project: _project, presentation: _presentation, ...metadata }) => metadata;
const CONTENT_FIELDS = ['title', 'format', 'text', 'key', 'meter', 'project', 'source', 'presentation'];
function mergeObject(previous, patch) {
  const base = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
  return { ...base, ...Object.fromEntries(Object.entries(patch).map(([key, value]) => [key,
    value && typeof value === 'object' && !Array.isArray(value) ? mergeObject(base[key], value) : value])) };
}
function mergeContent(previous, proposal) {
  const merged = { ...previous };
  for (const key of CONTENT_FIELDS) if (Object.hasOwn(proposal, key)) {
    if (['source', 'presentation'].includes(key)) {
      if (!proposal[key] || typeof proposal[key] !== 'object' || Array.isArray(proposal[key])) throw fail(400, `${key} 必须是对象；未修改现有内容。`);
      merged[key] = mergeObject(previous?.[key], proposal[key]);
    } else merged[key] = proposal[key];
  }
  return merged;
}

/** Shared by Vite dev and preview. Scores live on the Nota host, not in a browser. */
export function libraryMiddleware(directory = defaultDirectory) {
  const allowedHosts = (process.env.NOTA_ALLOWED_HOSTS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  let writes = Promise.resolve();
  const file = (id) => path.join(directory, `${id}.json`);
  const load = async (id) => {
    try { return JSON.parse(await readFile(file(id), "utf8")); }
    catch (e) { if (e.code === "ENOENT") throw fail(404, "这份曲谱不存在或已被移动。"); throw e; }
  };
  const loadActive = async (id) => {
    const record = await load(id);
    if (record.deletedAt) throw fail(404, "这份曲谱已删除，可在已删除曲谱中恢复。");
    return record;
  };
  const persist = async (record) => {
    await mkdir(directory, { recursive: true });
    const temporary = path.join(directory, `${record.id}.${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
    await rename(temporary, file(record.id));
  };
  const serialize = (work) => {
    const result = writes.then(work);
    writes = result.catch(() => {});
    return result;
  };
  return async (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://nota.local");
    const machine = url.pathname === "/api/agent/library" || url.pathname.startsWith("/api/agent/library/");
    if (!machine && !url.pathname.startsWith("/api/library")) return next();
    const send = (status, value) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      res.end(JSON.stringify(value));
    };
    try {
      if (machine) {
        await authorizeToolRequest(req);
        url.pathname = url.pathname.replace("/api/agent/library", "/api/library");
      }
      const host = new URL(`http://${req.headers.host ?? ""}`).hostname.toLowerCase();
      if (host !== "localhost" && !isIP(host.replace(/^\[|\]$/g, "")) && !allowedHosts.includes(host)) throw fail(403, "请通过已配置的 Nota 地址访问曲谱库。");
      let checking = /^\/api\/library\/check\/?$/.test(url.pathname);
      const match = /^\/api\/library(?:\/(deleted))?(?:\/([^/]+))?(?:\/(restore|check))?\/?$/.exec(checking ? "/api/library" : url.pathname);
      if (!match || (match[2] && !ID.test(match[2])) || (match[3] && (!match[2] || match[1]))) throw fail(404, "未找到曲谱。");
      const deletedRoute = !!match[1];
      const id = match[2];
      const hasOperationRoute = !!match[3];
      checking ||= match[3] === 'check';
      const restoreOperation = match[3] === 'restore';
      if (checking && req.method !== "POST") throw fail(405, "检查只接受 POST。");
      if (req.method === "GET") {
        if (hasOperationRoute) throw fail(405, "不支持此操作。");
        if (id) {
          const record = await load(id);
          if (!!record.deletedAt !== deletedRoute) throw fail(404, "这份曲谱不存在或已删除，可在已删除曲谱中恢复。");
          return send(200, record);
        }
        let names;
        try { names = await readdir(directory); }
        catch (e) { if (e.code === "ENOENT") return send(200, []); throw e; }
        const records = await Promise.all(names.filter((name) => ID.test(name.replace(/\.json$/, "")) && name.endsWith(".json"))
          .map(async (name) => {
            try { return summary(JSON.parse(await readFile(path.join(directory, name), "utf8"))); }
            catch (error) { if (error.code === "ENOENT") return null; throw error; }
          }));
        return send(200, records.filter(record => record && !!record.deletedAt === deletedRoute).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      }
      if (deletedRoute) throw fail(405, "不支持此操作。");
      if (hasOperationRoute && req.method !== "POST") throw fail(405, "不支持此操作。");
      if (!hasOperationRoute && (req.method !== "POST" || id) && (req.method !== "PUT" || !id) && (req.method !== "DELETE" || !id)) throw fail(405, "不支持此操作。");
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
      if (req.method === "DELETE" || restoreOperation) {
        if (!Number.isSafeInteger(data?.revision) || data.revision < 1) throw fail(400, "请提供有效的曲谱修订版本。");
        const deleted = await serialize(async () => {
          const previous = await load(id);
          if (data.revision !== previous.revision) throw fail(409, "其他人刚刚更新了这份曲谱，本次操作尚未完成。请重新读取后确认。");
          if (restoreOperation ? !previous.deletedAt : previous.deletedAt) throw fail(409, restoreOperation ? "这份曲谱已经恢复。请刷新曲谱库。" : "这份曲谱已经删除。可从已删除曲谱中恢复。");
          const now = new Date().toISOString();
          const record = { ...previous, revision: previous.revision + 1, updatedAt: now };
          if (restoreOperation) delete record.deletedAt;
          else record.deletedAt = now;
          await persist(record);
          return { ...summary(record), deleted: !restoreOperation };
        });
        return send(200, deleted);
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw fail(400, "请提供曲谱内容对象。");
      const saved = await serialize(async () => {
        const previous = id ? await loadActive(id) : null;
        if (previous && data.revision !== previous.revision) throw fail(409, "其他人刚刚更新了这份曲谱，请重新读取后核对；待提交内容尚未保存。");
        const candidate = previous ? mergeContent(previous, data) : data;
        let projectUpdate;
        if (previous?.project && machine) {
          try {
            candidate.project = await synchronizeProject(previous, candidate, data.edits);
            projectUpdate = { changed: candidate.project !== previous.project, sha256: createHash('sha256').update(Buffer.from(candidate.project, 'base64')).digest('hex') };
          } catch (error) {
            throw Object.assign(fail(422, error.message), { code: 'validation', data: { diagnostics: [{ severity: 'error', code: error.code ?? 'project_mapping', message: error.message, ...(error.source ? { source: error.source } : {}) }] } });
          }
        }
        if (typeof candidate.title !== "string" || !candidate.title.trim() || candidate.title.trim().length > 120 ||
            !FORMATS.has(candidate.format) || typeof candidate.text !== "string" || !candidate.text.trim() ||
            (candidate.project !== undefined && (typeof candidate.project !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(candidate.project)))) throw fail(400, "请填写曲名，并提供有效的曲谱内容。");
        if (candidate.source && typeof candidate.source === 'object') candidate.source = normalizeSourceProvenance(candidate.source, candidate.text, previous?.source);
        const report = await checkSubmission(candidate, { previous, intent: data.intent });
        if (projectUpdate) report.projectUpdate = projectUpdate;
        if (previous) report.fieldsChanged = CONTENT_FIELDS.filter(key => JSON.stringify(previous[key]) !== JSON.stringify(candidate[key]));
        if (checking) return { report };
        if (!report.ok) throw Object.assign(fail(422, "谱文未通过服务端检查，未保存。"), { code: "validation", data: report });
        let submission = previous?.submission;
        if (!id && machine) {
          if (data.requestId !== undefined && !ID.test(data.requestId)) throw fail(400, "创建请求编号无效。");
          let names;
          try { names = await readdir(directory); } catch (e) { if (e.code !== "ENOENT") throw e; names = []; }
          const existing = await Promise.all(names.filter(n => n.endsWith(".json") && ID.test(n.slice(0, -5))).map(n => load(n.slice(0, -5))));
          const requestHash = createHash("sha256").update(JSON.stringify({title:data.title,format:data.format,text:data.text,key:data.key,meter:data.meter,project:data.project,source:data.source,presentation:data.presentation})).digest("hex");
          const repeated = data.requestId && existing.find(r => r.submission?.requestId === data.requestId);
          if (repeated) {
            if (repeated.submission.hash !== requestHash) throw fail(409, "创建请求编号已用于不同内容，未保存。");
            return { record: summary(repeated), report };
          }
          const candidates = existing.filter(r => !r.deletedAt && r.title.toLocaleLowerCase() === data.title.trim().toLocaleLowerCase()).map(summary);
          if (candidates.length && data.allowDuplicateTitle !== true) throw Object.assign(fail(409, "存在同名曲谱，请明确修改已有曲谱还是另建版本。"), {code:"ambiguous",data:{candidates}});
          submission = data.requestId ? { requestId: data.requestId, hash: requestHash } : undefined;
        }
        const now = new Date().toISOString();
        const record = {
          ...previous,
          id: id ?? randomUUID(), title: candidate.title.trim(), format: candidate.format, text: candidate.text,
          key: typeof candidate.key === "string" ? candidate.key.slice(0, 24) : "",
          meter: typeof candidate.meter === "string" ? candidate.meter.slice(0, 24) : "",
          createdAt: previous?.createdAt ?? now, updatedAt: now, revision: (previous?.revision ?? 0) + 1,
          ...(candidate.project ? { project: candidate.project } : {}),
          ...(submission ? { submission } : {}),
          ...(candidate.source && typeof candidate.source === "object" ? { source: candidate.source } : {}),
          ...(candidate.presentation && typeof candidate.presentation === "object" ? { presentation: candidate.presentation } : {}),
        };
        await persist(record);
        return { record: summary(record), report };
      });
      if (checking) return send(saved.report.ok ? 200 : 422, saved.report);
      send(id ? 200 : 201, { ...saved.record, ...(id && machine ? { check: saved.report } : {}) });
    } catch (e) {
      send(e.status ?? 500, { error: e.status ? e.message : "暂时无法读写曲谱库，请检查 Nota 服务后重试。", ...(e.code ? { code: e.code } : {}), ...(e.data ? { data: e.data } : {}) });
    }
  };
}

export function notaLibrary(directory) {
  const install = (server) => { server.middlewares.use(libraryMiddleware(directory)); };
  return { name: "nota-shared-library", configureServer: install, configurePreviewServer: install };
}
