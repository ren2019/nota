import { provenanceFooterSource } from "./score-footer-source";
import type { App } from "../editor/app";
import { showConfirmDialog, showFormDialog, showUnsavedLibraryDialog } from "../editor/dialogs";
import { keyLabel } from "./convert";
import "./library.css";
import { CurrentDocumentSession, libraryRequest as request, LibraryError, writeLibraryScore, bytesBase64, type LibraryItem, type LibrarySaveResult } from "./document-session";
import { mountSourceImport, type SourceCandidate } from "./source-import";

/** One shared library on the Nota host; opening a score never re-runs recognition. */
export function mountLibrary(app: App, revealWorkspace: (mode?: "practice" | "edit") => void, session: CurrentDocumentSession, onSaved: () => void) {
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
  let opening = false;
  let inFlight:Promise<LibrarySaveResult> | null = null;
  let guard:Promise<boolean> | null = null;
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
    if (opening) return;
    opening = true;
    button.disabled = true;
    try {
      if (session.current?.id !== item.id) {
        if (!(await app.confirmReplace())) return;
        await session.openLibrary(item.id);
      }
      revealWorkspace("practice");
    } catch (e) {
      message.hidden = false;
      message.textContent = e instanceof Error ? e.message : String(e);
      message.classList.add("is-error");
    } finally { opening = false; button.disabled = false; }
  }

  function nameScore(): Promise<{ title: string; copy: boolean } | null> {
    if(session.current) return Promise.resolve({title:session.current.title,copy:false});
    return new Promise((resolve) => {
      const body = document.createElement("div");
      body.className = "library-save-form";
      const label = document.createElement("label");
      label.textContent = "曲名";
      const input = document.createElement("input");
      input.value = session.current?.title ?? session.importedTitle ?? app.documentTitle() ?? "未命名曲谱";
      input.maxLength = 120;
      input.setAttribute("aria-label", "曲名");
      label.append(input);
      body.append(label);
      const location=document.createElement("p");
      location.textContent="保存到当前 Nota 服务的曲谱库，连接同一服务的家人可访问。";
      body.append(location);
      const copy = document.createElement("input");
      copy.type = "checkbox";
      if (session.current) {
        const option = document.createElement("label");
        option.className = "library-copy-option";
        option.append(copy, "另存一份，保留原曲谱");
        body.append(option);
      }
      showFormDialog("保存到曲谱库", body, () => resolve({ title: input.value.trim() || "未命名曲谱", copy: copy.checked }), "保存", () => resolve(null));
      input.select();
    });
  }

  async function performSave(navigate:boolean):Promise<LibrarySaveResult> {
    if (!app.getText().trim() || !app.scoreDoc()?.songs.length) { app.setStatus("请先打开或创作一份曲谱。"); return {status:'failed'}; }
    const buttons=[saveButton,document.getElementById('nota-detail-save') as HTMLButtonElement | null].filter((button):button is HTMLButtonElement => !!button);
    buttons.forEach(button => {button.disabled=true;button.textContent='正在保存…';});
    try {
      const named=await nameScore();
      if(!named) return {status:'cancelled'};
      await app.whenIdle();
      const snapshot=session.capture();
      const song=app.scoreDoc()?.songs[0];
      const payload={title:named.title,text:snapshot.text,format:snapshot.format,
        ...(snapshot.source ? {source:snapshot.source} : {}),
        key:song?.key ? `1=${keyLabel(song.key.fifths)}` : '',
        meter:song?.time ? `${song.time.beats}/${song.time.beatType}` : '',
        ...(snapshot.project ? {project:bytesBase64(snapshot.project)} : {}),presentation:snapshot.presentation,
      };
      let existing=session.current && !named.copy ? session.current : null;
      let saved:LibraryItem;
      try {saved=await writeLibraryScore(payload,existing);}
      catch(error) {
        if(!(error instanceof LibraryError) || error.status !== 409) throw error;
        if(!(await showConfirmDialog('曲谱已被家人更新','保留家人的更新，把刚提交的版本另存为一份新曲谱吗？当前新修改也会保留。'))) return {status:'cancelled'};
        existing=null; saved=await writeLibraryScore({...payload,title:`${payload.title.slice(0,116)}（副本）`},null);
      }
      const unchanged=session.acceptSaved(saved,snapshot);
      if(unchanged) app.markClean(); else app.files._scheduleDraft();
      app.setStatus(unchanged ? `已保存「${saved.title}」到当前 Nota 服务的曲谱库。` : `已保存刚提交的版本；当前的新修改尚未入库，请再次保存。`);
      await refresh();
      // Refresh is asynchronous too: a new edit made while it ran must keep the user in editing.
      const stillCurrent=session.matches(snapshot);
      if(unchanged && stillCurrent) {
        if(navigate) onSaved();
        return {status:'saved',item:saved};
      }
      return {status:'changed',item:saved};
    } catch(error) {app.setStatus(error instanceof Error ? error.message : String(error)); return {status:'failed'};}
    finally {buttons.forEach(button => {button.disabled=false;button.textContent='保存入库';});}
  }
  function save(navigate=true):Promise<LibrarySaveResult> {
    if(inFlight) return inFlight;
    inFlight=performSave(navigate).finally(() => {inFlight=null;});
    return inFlight;
  }
  function confirmReplace(closing=false):Promise<boolean> {
    if(guard) return Promise.resolve(false);
    if(!session.dirty) return Promise.resolve(true);
    guard=(async () => {
      const outcome=await showUnsavedLibraryDialog(session.title,closing);
      if(outcome === 'cancel') return false;
      if(outcome === 'discard') return true;
      const result=await save(false);
      return result.status === 'saved' && !session.dirty;
    })().finally(() => {guard=null;});
    return guard;
  }

  async function adoptCandidate(candidate: SourceCandidate) {
    if (!(await app.confirmReplace())) return;
    session.detach(candidate.source, candidate.title);
    app.playback.stop(); app.omr.clear();
    app.adoptText(candidate.format, candidate.text, null); app.formats.use(null);
    await app.setViewMode(candidate.format === 'musicxml' ? 'staff' : 'expanded');
    await app.whenIdle();
    app.exportSourceDescription = provenanceFooterSource(session.source);
    app.setStatus(`已打开「${candidate.title}」候选。来源数据对照通过；请核对版本与谱面，确认后保存到曲谱库。`);
    revealWorkspace("edit");
  }
  mountSourceImport(adoptCandidate);
  search.addEventListener("input", render);
  root.querySelector("#library-refresh")!.addEventListener("click", () => void refresh());
  void refresh();
  return { save, refresh, confirmReplace, detach: () => session.detach() };
}
