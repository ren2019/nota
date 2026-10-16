import { provenanceFooterSource } from "./score-footer-source";
import type { App, ViewMode } from "../editor/app";
import type { DocFormatId } from "../editor/formats";
import { packProject } from "../editor/omrproject";
import { showConfirmDialog, showFormDialog } from "../editor/dialogs";
import { keyLabel } from "./convert";
import "./library.css";
import { mountSourceImport, type SourceProvenance, type SourceCandidate } from "./source-import";

interface LibraryItem {
  id: string;
  title: string;
  format: DocFormatId;
  key: string;
  meter: string;
  updatedAt: string;
  revision: number;
  source?: SourceProvenance;
}
interface LibraryScore extends LibraryItem {
  text: string;
  project?: string;
  presentation?: { mode: ViewMode; noteSize: number; paper: string; orientation: "portrait" | "landscape"; margin: number[] | null };
}

class LibraryError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function request<T>(path = "", options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api/library${path}`, options); }
  catch { throw new Error("暂时连接不到曲谱库，请确认 Nota 服务正在运行。"); }
  const body = await response.json().catch(() => null);
  if (!response.ok || body === null) throw new LibraryError(body?.error ?? "曲谱库暂时不可用，请稍后重试。", response.status);
  return body as T;
}
function base64(bytes: Uint8Array): string {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 32768) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
  return btoa(chunks.join(""));
}

/** One shared library on the Nota host; opening a score never re-runs recognition. */
export function mountLibrary(app: App, revealWorkspace: () => void) {
  const root = document.createElement("section");
  root.id = "nota-library";
  root.setAttribute("aria-labelledby", "library-title");
  root.innerHTML = `
    <div class="library-heading">
      <div><span class="eyebrow">一起练习，慢慢收藏</span><h2 id="library-title">我们的曲谱库 <span id="library-count"></span></h2>
      <p>把喜欢的曲子留在这里，下次接着练。</p></div>
      <button id="library-refresh" class="library-refresh" type="button">刷新</button>
    </div>
    <label class="library-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>
      <input id="library-search" type="search" placeholder="搜索曲名或调号" aria-label="搜索曲谱库" autocomplete="off"></label>
    <p id="library-message" class="library-message" role="status" aria-live="polite">正在打开曲谱库…</p>
    <div id="library-list" class="library-list"></div>
    <p class="library-location">曲谱保存在本机 Nota 服务中，访问同一服务的家人共享。</p>`;
  document.querySelector(".start-content")!.append(root);
  const search = root.querySelector<HTMLInputElement>("#library-search")!;
  const list = root.querySelector<HTMLDivElement>("#library-list")!;
  const message = root.querySelector<HTMLParagraphElement>("#library-message")!;
  const count = root.querySelector<HTMLSpanElement>("#library-count")!;
  const saveButton = document.getElementById("btn-save") as HTMLButtonElement;
  let items: LibraryItem[] = [];
  let current: LibraryItem | null = null;
  let source: SourceProvenance | undefined;
  let importedTitle: string | undefined;
  let busy = false;
  let fetching = false;

  function render() {
    const query = search.value.normalize("NFKC").toLocaleLowerCase().trim();
    const shown = items.filter((item) => `${item.title} ${item.key}`.normalize("NFKC").toLocaleLowerCase().includes(query));
    count.textContent = `${shown.length} 首`;
    list.replaceChildren();
    message.hidden = shown.length > 0;
    message.classList.remove("is-error");
    message.textContent = query ? "没有找到这首曲子，试试别的曲名或调号。" : "还没有收藏的曲谱。打开或创作一首，在右上角保存到曲谱库。";
    for (const item of shown) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "library-item";
      row.setAttribute("aria-label", `打开 ${item.title}`);
      const icon = document.createElement("span");
      icon.className = "library-score-icon";
      icon.textContent = "♪";
      icon.setAttribute("aria-hidden", "true");
      const copy = document.createElement("span");
      copy.className = "library-item-copy";
      const title = document.createElement("strong");
      title.textContent = item.title;
      const details = document.createElement("span");
      details.textContent = [item.key, item.meter, item.format === "musicxml" ? "五线谱" : "简谱", item.source ? (item.source.edited ? "联网导入 · 已编辑" : "联网导入 · 导入时对照通过") : ""].filter(Boolean).join(" · ");
      copy.append(title, details);
      const time = document.createElement("time");
      time.dateTime = item.updatedAt;
      time.textContent = new Date(item.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) + " 保存";
      const arrow = document.createElement("span");
      arrow.textContent = "↗";
      arrow.className = "library-item-arrow";
      arrow.setAttribute("aria-hidden", "true");
      row.append(icon, copy, time, arrow);
      row.onclick = () => void open(item, row);
      list.append(row);
    }
  }

  async function refresh() {
    if (fetching) return;
    fetching = true;
    try { items = await request<LibraryItem[]>(); render(); }
    catch (e) { message.hidden = false; message.textContent = e instanceof Error ? e.message : String(e); message.classList.add("is-error"); }
    finally { fetching = false; }
  }

  async function open(item: LibraryItem, button: HTMLButtonElement) {
    if (busy) return;
    busy = true;
    button.disabled = true;
    try {
      if (!(await app.confirmReplace())) return;
      const saved = await request<LibraryScore>(`/${item.id}`);
      app.playback.stop();
      if (saved.project) {
        const bytes = Uint8Array.from(atob(saved.project), (c) => c.charCodeAt(0));
        if (!(await app.openProject(bytes, `${saved.title}.dolce`))) throw new Error("这份曲谱的原图项目暂时无法打开。");
      } else {
        app.omr.clear();
        app.adoptText(saved.format, saved.text, null);
        app.formats.use(null);
      }
      const p = saved.presentation;
      if (p && ["original", "expanded", "staff", "mixed"].includes(p.mode)) {
        await app.setViewMode(p.mode);
        if (Number.isFinite(p.noteSize) && p.noteSize >= 8 && p.noteSize <= 72) app.applyRenderSettings({
          fontSize: p.noteSize,
          paper: { jianpu: { paper: p.paper, orientation: p.orientation === "landscape" ? "landscape" : "portrait", margin: p.margin } },
        });
      }
      await app.whenIdle();
      current = saved;
      source = saved.source;
      app.exportSourceDescription = provenanceFooterSource(source);
      importedTitle = undefined;
      app.markClean();
      app.setStatus(`已从曲谱库打开「${saved.title}」。${saved.source ? "来源在导入时已独立对照，后续编辑请另行复核。" : ""}`);
      revealWorkspace();
    } catch (e) {
      message.hidden = false;
      message.textContent = e instanceof Error ? e.message : String(e);
      message.classList.add("is-error");
    } finally { busy = false; button.disabled = false; }
  }

  function nameScore(): Promise<{ title: string; copy: boolean } | null> {
    return new Promise((resolve) => {
      const body = document.createElement("div");
      body.className = "library-save-form";
      const label = document.createElement("label");
      label.textContent = "曲名";
      const input = document.createElement("input");
      input.value = current?.title ?? importedTitle ?? app.documentTitle() ?? "未命名曲谱";
      input.maxLength = 120;
      input.setAttribute("aria-label", "曲名");
      label.append(input);
      body.append(label);
      const copy = document.createElement("input");
      copy.type = "checkbox";
      if (current) {
        const option = document.createElement("label");
        option.className = "library-copy-option";
        option.append(copy, "另存一份，保留原曲谱");
        body.append(option);
      }
      showFormDialog("保存到曲谱库", body, () => resolve({ title: input.value.trim() || "未命名曲谱", copy: copy.checked }), "保存", () => resolve(null));
      input.select();
    });
  }

  async function save(): Promise<void> {
    if (busy) return;
    if (!app.getText().trim() || !app.scoreDoc()?.songs.length) { app.setStatus("请先打开或创作一份曲谱。"); return; }
    busy = true;
    const caption = saveButton.textContent;
    saveButton.disabled = true;
    try {
      const named = await nameScore();
      if (!named) return;
      const text = app.getText();
      const format = app.docFormat;
      const song = app.scoreDoc()?.songs[0];
      const snapshot = app.omr.snapshot();
      const page = app.paperState("jianpu").page;
      const payload = {
        title: named.title, text, format,
        ...(source ? {source} : {}),
        key: song?.key ? `1=${keyLabel(song.key.fifths)}` : "",
        meter: song?.time ? `${song.time.beats}/${song.time.beatType}` : "",
        ...(snapshot ? { project: base64(packProject(snapshot, __APP_VERSION__)) } : {}),
        presentation: { mode: app.viewMode, noteSize: app.fontSize, paper: page.paper ?? "A4", orientation: page.orientation ?? "portrait", margin: Array.isArray(page.margin) ? page.margin : null },
        ...(current && !named.copy ? { revision: current.revision } : {}),
      };
      saveButton.textContent = "正在保存…";
      let existing = current && !named.copy ? current : null;
      let saved: LibraryItem;
      const write = () => request<LibraryItem>(existing ? `/${existing.id}` : "", {
        method: existing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      try { saved = await write(); }
      catch (e) {
        if (!(e instanceof LibraryError) || e.status !== 409) throw e;
        if (!(await showConfirmDialog("曲谱已被家人更新", "保留家人的更新，把你现在的版本另存为一份新曲谱吗？"))) return;
        existing = null;
        saved = await write();
      }
      current = saved;
      if (app.getText() === text && app.docFormat === format) app.markClean();
      app.setStatus(`已保存「${saved.title}」到曲谱库。回到首页即可找到。`);
      await refresh();
    } catch (e) { app.setStatus(e instanceof Error ? e.message : String(e)); }
    finally { busy = false; saveButton.disabled = false; saveButton.textContent = caption; }
  }

  async function adoptCandidate(candidate: SourceCandidate) {
    if (!(await app.confirmReplace())) return;
    app.playback.stop(); app.omr.clear();
    app.adoptText(candidate.format, candidate.text, null); app.formats.use(null);
    await app.setViewMode(candidate.format === 'musicxml' ? 'staff' : 'expanded');
    await app.whenIdle(); current = null; source = candidate.source; importedTitle = candidate.title;
    app.exportSourceDescription = provenanceFooterSource(source);
    app.setStatus(`已打开「${candidate.title}」候选。来源数据对照通过；请核对版本与谱面，确认后保存到曲谱库。`);
    revealWorkspace();
  }
  mountSourceImport(adoptCandidate);
  search.addEventListener("input", render);
  root.querySelector("#library-refresh")!.addEventListener("click", () => void refresh());
  void refresh();
  return { save, refresh, detach: () => { current = null; source = undefined; importedTitle = undefined; app.exportSourceDescription = ""; } };
}
