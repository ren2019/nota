import { onLangChange, t } from '../i18n';
import { provenanceFooterSource, provenanceStatus } from "./score-footer-source";
import type { App } from "../editor/app";
import { showConfirmDialog, showFormDialog, showUnsavedLibraryDialog, openModal } from "../editor/dialogs";
import { keyLabel } from "./convert";
import "./library.css";
import { CurrentDocumentSession, libraryRequest as request, LibraryError, writeLibraryScore, restoreLibraryScore, bytesBase64, type LibraryItem, type LibrarySaveResult } from "./document-session";
import { type SourceCandidate } from "./source-import";

/** One shared library on the Nota host; opening a score never re-runs recognition. */
export function mountLibrary(app: App, revealWorkspace: (mode?: "practice" | "edit") => void, session: CurrentDocumentSession, onSaved: () => void) {
  const root = document.createElement("section");
  root.id = "nota-library";
  root.setAttribute("aria-labelledby", "library-title");
  root.innerHTML = `
    <div class="library-heading">
      <div><span class="eyebrow"><span data-i18n="nota.ia.htmlPracticeTogetherKeepFavorites36">${t("nota.ia.htmlPracticeTogetherKeepFavorites36")}</span></span><h2 id="library-title"><span data-i18n="nota.ia.htmlOurScoreLibrary37">${t("nota.ia.htmlOurScoreLibrary37")}</span><span id="library-count"></span></h2>
      <p><span data-i18n="nota.ia.htmlKeepFavoriteSongsHereAnd38">${t("nota.ia.htmlKeepFavoriteSongsHereAnd38")}</span></p></div>
      <div class="library-actions"><button id="library-deleted" class="library-refresh" type="button"><span data-i18n="nota.ia.deletedScores">${t("nota.ia.deletedScores")}</span></button><button id="library-refresh" class="library-refresh" type="button"><span data-i18n="nota.ia.htmlRefresh39">${t("nota.ia.htmlRefresh39")}</span></button></div>
    </div>
    <label class="library-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>
      <input id="library-search" type="search" placeholder="${t("nota.ia.htmlSearchTitleOrKey42")}" data-i18n-placeholder="nota.ia.htmlSearchTitleOrKey42" aria-label="${t("nota.ia.htmlSearchScoreLibrary43")}" data-i18n-aria="nota.ia.htmlSearchScoreLibrary43" autocomplete="off"></label>
    <p id="library-message" class="library-message" role="status" aria-live="polite"><span data-i18n="nota.ia.htmlOpeningTheScoreLibrary40">${t("nota.ia.htmlOpeningTheScoreLibrary40")}</span></p>
    <div id="library-list" class="library-list"></div>
    <p class="library-location"><span data-i18n="nota.ia.htmlScoresAreStoredOnThis41">${t("nota.ia.htmlScoresAreStoredOnThis41")}</span></p>`;
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
  let mutationVersion = 0;
  let refreshAgain = false;

  function render() {
    const query = search.value.normalize("NFKC").toLocaleLowerCase().trim();
    const shown = items.filter((item) => `${item.title} ${item.key}`.normalize("NFKC").toLocaleLowerCase().includes(query));
    count.textContent = t('nota.ia.libraryCount',{count:shown.length});
    list.replaceChildren();
    message.hidden = shown.length > 0;
    message.classList.remove("is-error");
    message.textContent = query ? t("nota.ia.noMatchingScoreTryAnother") : t("nota.ia.noSavedScoresYetOpen");
    for (const item of shown) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "library-item";
      row.setAttribute("aria-label", t('nota.ia.libraryOpen',{title:item.title}));
      const icon = document.createElement("span");
      icon.className = "library-score-icon";
      icon.textContent = "♪";
      icon.setAttribute("aria-hidden", "true");
      const copy = document.createElement("span");
      copy.className = "library-item-copy";
      const title = document.createElement("strong");
      title.textContent = item.title;
      const details = document.createElement("span");
      details.textContent = [item.key, item.meter, item.format === "musicxml" ? t("nota.ia.staffNotation") : t("nota.ia.jianpu"), provenanceStatus(item.source)].filter(Boolean).join(" · ");
      copy.append(title, details);
      const time = document.createElement("time");
      time.dateTime = item.updatedAt;
      time.textContent = new Date(item.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) + t("nota.ia.saved");
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
    if (fetching) {refreshAgain=true;return;}
    fetching = true;
    const version=mutationVersion;
    try {
      const incoming=await request<LibraryItem[]>();
      if(version !== mutationVersion) {refreshAgain=true;return;}
      items=incoming;render();
    }
    catch (e) {
      if(version !== mutationVersion) refreshAgain=true;
      else {message.hidden = false; message.textContent = e instanceof Error ? e.message : String(e); message.classList.add("is-error");}
    }
    finally { fetching = false;if(refreshAgain) {refreshAgain=false;void refresh();} }
  }
  function applyMetadata(item:LibraryItem) {
    const old=items.find(existing => existing.id === item.id);
    if(old && old.revision > item.revision) return;
    mutationVersion++;items=[item,...items.filter(existing => existing.id !== item.id)];render();
  }
  function removeItem(id:string) {
    mutationVersion++;items=items.filter(item => item.id !== id);render();
  }

  async function showDeleted() {
    const body=document.createElement('div');body.className='library-deleted-list';
    const explanation=document.createElement('p');explanation.textContent=t('nota.ia.deletedScoresExplanation');
    const feedback=document.createElement('p');feedback.setAttribute('role','status');feedback.textContent=t('nota.ia.loadingDeletedScores');
    const rows=document.createElement('div');body.append(explanation,feedback,rows);
    const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent=t('nota.ia.close');
    let closed=false;
    const {close}=openModal({title:t('nota.ia.deletedScores'),boxClass:'nota-management-box',body:[body],footer:[dismiss],onClose:() => {closed=true;}});dismiss.onclick=close;
    try {
      const deleted=await request<LibraryItem[]>('/deleted');
      if(closed) return;
      feedback.textContent=deleted.length ? '' : t('nota.ia.noDeletedScores');
      for(const item of deleted) {
        const row=document.createElement('div');row.className='library-item';
        const copy=document.createElement('span');copy.className='library-item-copy';
        const title=document.createElement('strong');title.textContent=item.title;
        const date=document.createElement('span');date.textContent=item.deletedAt ? new Date(item.deletedAt).toLocaleString() : '';
        copy.append(title,date);
        const restore=document.createElement('button');restore.type='button';restore.className='library-refresh';restore.textContent=t('nota.ia.restoreScore');restore.setAttribute('aria-label',t('nota.ia.restoreNamedScore',{title:item.title}));
        row.append(copy,restore);rows.append(row);
        restore.onclick=() => void (async() => {
          restore.disabled=true;feedback.textContent=t('nota.ia.restoringScore');
          try {
            const restored=await restoreLibraryScore(item);
            applyMetadata(restored);void refresh();
            if(!closed) {row.remove();feedback.textContent=t('nota.ia.restoreSuccess',{title:item.title});}
          } catch(error) {if(!closed) {feedback.textContent=error instanceof Error ? error.message : String(error);restore.disabled=false;}}
        })();
      }
    } catch(error) {if(!closed) feedback.textContent=error instanceof Error ? error.message : String(error);}
  }

  async function open(item: LibraryItem, button: HTMLButtonElement) {
    if (opening) return;
    opening = true;
    button.disabled = true;
    try {
      // A clean current song may have a newer server revision; keep only unsaved local work.
      if (session.current?.id !== item.id || !session.dirty) {
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
      label.textContent = t("nota.ia.title");
      const input = document.createElement("input");
      input.value = session.current?.title ?? session.importedTitle ?? app.documentTitle() ?? t("nota.ia.untitledScore");
      input.maxLength = 120;
      input.setAttribute("aria-label", t("nota.ia.title"));
      label.append(input);
      body.append(label);
      const location=document.createElement("p");
      location.textContent=t("nota.ia.savedInThisNotaService");
      body.append(location);
      const copy = document.createElement("input");
      copy.type = "checkbox";
      if (session.current) {
        const option = document.createElement("label");
        option.className = "library-copy-option";
        option.append(copy, t("nota.ia.saveACopyAndKeep"));
        body.append(option);
      }
      showFormDialog(t("nota.ia.saveToLibrary"), body, () => resolve({ title: input.value.trim() || t("nota.ia.untitledScore"), copy: copy.checked }), t("nota.ia.save"), () => resolve(null));
      input.select();
    });
  }

  async function performSave(navigate:boolean):Promise<LibrarySaveResult> {
    if(session.loading || app.inputBusy) {app.setStatus(t("nota.ia.inputIsBeingProcessedWait"));return {status:'failed'};}
    if (!app.getText().trim() || !app.scoreDoc()?.songs.length) { app.setStatus(t("nota.ia.openOrCreateAScore")); return {status:'failed'}; }
    const buttons=[saveButton,document.getElementById('nota-detail-save') as HTMLButtonElement | null].filter((button):button is HTMLButtonElement => !!button);
    buttons.forEach(button => {button.disabled=true;button.textContent=t("nota.ia.saving");});
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
        if(!(await showConfirmDialog(t("nota.ia.thisScoreWasUpdatedBy"),t("nota.ia.keepTheirUpdateAndSave")))) return {status:'cancelled'};
        existing=null; saved=await writeLibraryScore({...payload,title:t('nota.ia.copyTitle',{title:payload.title.slice(0,116)})},null);
      }
      const unchanged=session.acceptSaved(saved,snapshot);
      if(unchanged) app.markClean(); else app.files._scheduleDraft();
      app.setStatus(unchanged ? t('nota.ia.librarySaved',{title:saved.title}) : t("nota.ia.theSubmittedVersionIsSaved"));
      await refresh();
      // Refresh is asynchronous too: a new edit made while it ran must keep the user in editing.
      const stillCurrent=session.matches(snapshot);
      if(unchanged && stillCurrent) {
        if(navigate) onSaved();
        return {status:'saved',item:saved};
      }
      return {status:'changed',item:saved};
    } catch(error) {
      const message=error instanceof Error ? error.message : String(error);
      app.setStatus(message);
      // Detail/home hide the professional status bar: a failed save must remain visible
      // before replacement gates stop, rather than leaving an unexplained dirty draft.
      const body=document.createElement('p');body.textContent=message;body.setAttribute('role','alert');
      const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent=t('nota.ia.close');
      const {close}=openModal({title:t('nota.ia.saveToLibrary'),body:[body],footer:[dismiss]});dismiss.onclick=close;
      return {status:'failed'};
    }
    finally {buttons.forEach(button => {button.disabled=false;button.textContent=t("nota.ia.saveToLibrary135");});}
  }
  function save(navigate=true):Promise<LibrarySaveResult> {
    if(inFlight) return inFlight;
    inFlight=performSave(navigate).finally(() => {inFlight=null;});
    return inFlight;
  }
  function confirmReplace(closing=false):Promise<boolean> {
    if(guard || session.loading || app.inputBusy) return Promise.resolve(false);
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
    if (!(await app.confirmReplace())) return false;
    const adopted=await app.runInputTransaction(async () => {
      app.playback.stop();app.omr.clear();
      app.adoptText(candidate.format,candidate.text,null);app.formats.use(null);
      await app.setViewMode(candidate.format === 'musicxml' ? 'staff' : 'expanded');
      await app.whenIdle();return !!app.scoreDoc()?.songs.length;
    });
    if(!adopted) return false;
    session.detach(candidate.source,candidate.title);
    app.exportSourceDescription = provenanceFooterSource(session.source);
    app.setStatus(t('nota.ia.candidateOpened',{title:candidate.title}));
    revealWorkspace("edit");
    return true;
  }
  onLangChange(render);
  search.addEventListener("input", render);
  root.querySelector("#library-deleted")!.addEventListener("click", () => void showDeleted());
  root.querySelector("#library-refresh")!.addEventListener("click", () => void refresh());
  void refresh();
  return { save, refresh, applyMetadata, removeItem, confirmReplace, adoptCandidate, detach: () => session.detach() };
}
