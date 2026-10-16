import { onLangChange, t } from '../i18n';
import type { DocumentDetail } from "./detail";
import { ScoreSearchSession } from "./score-search";
import "./score-search.css";
export interface SourceProvenance {
  url: string;
  license: string;
  sha256: string;
  importedAt: string;
  validation: string;
  method: string;
  scope: string;
  part: string;
  importedTextHash: string;
  edited?: boolean;
}
export interface SourceCandidate {
  schema: string;
  title: string;
  text: string;
  format: "abc" | "musicxml";
  notes: number;
  measures: number;
  sourceCompared: boolean;
  scope: string;
  source: SourceProvenance;
}
export interface SourceItem {
  id?: string;
  format?: "abc" | "musicxml";
  part?: number;
  title: string;
  aliases: string;
  edition: string;
  composer?: string;
  sourceName?: string;
  license: string;
  url: string;
}

/** A full browsing page; no document replacement occurs until explicit adoption. */
export function mountSourceImport(adopt:(candidate:SourceCandidate)=>Promise<boolean>, navigation:DocumentDetail) {
  const session=new ScoreSearchSession();
  let launch=document.getElementById("nota-find-score") as HTMLButtonElement | null;
  if(!launch) { launch=document.createElement("button");launch.type="button";launch.className="library-refresh";launch.textContent=t("nota.ia.findScoresOnline");launch.id="nota-find-score";document.querySelector(".library-heading")!.append(launch); }
  launch.dataset.i18n='nota.ia.findScoresOnline';
  launch.onclick=()=>navigation.showSearch();
  const page=document.createElement("section");page.id="nota-score-search";
  page.innerHTML=`<header class="nota-search-head"><button type="button" class="nota-search-back" aria-label="${t("nota.ia.htmlBackToLibrary4")}" data-i18n-aria="nota.ia.htmlBackToLibrary4">‹</button><div><h1><span data-i18n="nota.ia.findScoresOnline">${t("nota.ia.findScoresOnline")}</span></h1><p><span data-i18n="nota.ia.htmlSearchTheConnectedOpenscoreSong26">${t("nota.ia.htmlSearchTheConnectedOpenscoreSong26")}</span></p></div></header><div class="nota-search-scroll"><p class="nota-search-intro"><span data-i18n="nota.ia.htmlFindAnEditionThenDownload27">${t("nota.ia.htmlFindAnEditionThenDownload27")}</span></p><form class="nota-source-form"><label class="sr-only" for="nota-source-query"><span data-i18n="nota.ia.htmlTitleOrComposer28">${t("nota.ia.htmlTitleOrComposer28")}</span></label><input id="nota-source-query" type="search" placeholder="${t("nota.ia.htmlEnterATitleOrComposer34")}" data-i18n-placeholder="nota.ia.htmlEnterATitleOrComposer34" autocomplete="off"><button type="submit"><span data-i18n="nota.ia.search">${t("nota.ia.search")}</span></button></form><p class="nota-search-status" role="status" aria-live="polite"></p><h2 class="nota-search-results-title"></h2><div class="nota-search-results"></div><section class="nota-search-selection"></section><details class="nota-external-source"><summary><span data-i18n="nota.ia.htmlImportAScoreCandidateFile30">${t("nota.ia.htmlImportAScoreCandidateFile30")}</span></summary><p><span data-i18n="nota.ia.htmlAcceptsNotaScoreJsonJson31">${t("nota.ia.htmlAcceptsNotaScoreJsonJson31")}</span></p><input id="nota-source-file" type="file" accept=".json,.nota-score.json" aria-label="${t("nota.ia.htmlChooseScoreCandidateFile35")}" data-i18n-aria="nota.ia.htmlChooseScoreCandidateFile35"></details><p class="nota-search-scope"><span data-i18n="nota.ia.htmlCollectionAFixedEditionOf32">${t("nota.ia.htmlCollectionAFixedEditionOf32")}</span></p></div><footer class="nota-search-actions"><p class="nota-search-open-reason"></p><button type="button" class="nota-source-adopt"><span data-i18n="nota.ia.htmlOpenAndReview33">${t("nota.ia.htmlOpenAndReview33")}</span></button></footer>`;
  document.getElementById("app")!.append(page);
  const query=page.querySelector<HTMLInputElement>("#nota-source-query")!;
  const form=page.querySelector<HTMLFormElement>("form")!;
  const search=page.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const list=page.querySelector<HTMLElement>(".nota-search-results")!;
  const selection=page.querySelector<HTMLElement>(".nota-search-selection")!;
  const title=page.querySelector<HTMLElement>(".nota-search-results-title")!;
  const status=page.querySelector<HTMLElement>(".nota-search-status")!;
  const open=page.querySelector<HTMLButtonElement>(".nota-source-adopt")!;
  const reason=page.querySelector<HTMLElement>(".nota-search-open-reason")!;
  const file=page.querySelector<HTMLInputElement>("#nota-source-file")!;
  page.querySelector<HTMLButtonElement>(".nota-search-back")!.onclick=()=>navigation.home();
  form.onsubmit=event=>{event.preventDefault();void session.submit();};
  query.oninput=()=>session.setDraft(query.value);
  open.onclick=()=>void session.adopt(adopt);
  file.onchange=()=>{const chosen=file.files?.[0];file.value="";if(chosen) void session.validateFile(chosen);};
  function paragraph(text:string) {const p=document.createElement("p");p.textContent=text;return p;}
  function render() {
    const busy=session.phase === "adopting";
    query.disabled=search.disabled=file.disabled=busy;
    search.textContent=session.phase === "searching" ? t("nota.ia.searching") : t("nota.ia.search");
    status.classList.toggle("is-error",!!session.error);
    status.textContent=session.error || (session.pendingQuery ? t(session.query ? 'nota.ia.inputHasNotBeenSubmitted' : 'nota.ia.queryPending') : {
      idle:t("nota.ia.enterATitleOrComposer"),searching:t("nota.ia.searchingTheStructuredScoreIndex"),results:t("nota.ia.chooseARelevantEditionAnd"),empty:t("nota.ia.noMatchingCandidatesTryAnother"),preparing:t("nota.ia.downloadingTheOriginalAndIndependently"),ready:t("nota.ia.sourceComparisonPassedCheckThe"),adopting:t("nota.ia.finishSavingOrReplacingThe"),error:t("nota.ia.searchOrValidationFailedPlease"),
    }[session.phase]);
    title.hidden=!session.query;
    title.textContent=session.phase === "searching" || (session.phase === "error" && !session.items.length) ? t('nota.ia.searchQuery',{query:session.query}) : t('nota.ia.searchResults',{query:session.query,count:session.items.length});
    list.replaceChildren();selection.replaceChildren();
    for(const item of session.items) {
      const row=document.createElement("button");row.type="button";row.className="nota-source-result";
      const selected=session.selected?.url === item.url;
      row.classList.toggle("selected",selected);row.setAttribute("aria-pressed",String(selected));row.disabled=busy || session.pendingQuery;
      const name=document.createElement("strong");name.textContent=item.title;
      const author=document.createElement("span");author.textContent=item.composer || t("nota.ia.seeSourceForComposerAnd");
      const edition=document.createElement("small");edition.textContent=[item.edition,item.sourceName || new URL(item.url).hostname].filter(Boolean).join(" · ");
      row.append(name,author,edition);row.onclick=()=>session.select(item);list.append(row);
      if(selected) list.append(selection);
    }
    if(!selection.isConnected || selection.parentElement !== list) list.after(selection);
    const chosen=session.selected, candidate=session.candidate;
    selection.hidden=!chosen && !candidate && session.phase !== "preparing";
    if(chosen) {
      selection.append(paragraph(chosen.title),paragraph(chosen.license));
      const source=document.createElement("a");source.href=chosen.url;source.target="_blank";source.rel="noopener noreferrer";source.textContent=t("nota.ia.viewSourceFile");selection.append(source);
      if(!candidate) {
        selection.append(paragraph(t("nota.ia.theOriginalHasNotBeen")));
        const prepare=document.createElement("button");prepare.type="button";prepare.textContent=session.phase === "preparing" ? t("nota.ia.downloadingAndValidating") : t("nota.ia.downloadAndValidateThisEdition");prepare.disabled=session.phase === "preparing" || busy || session.pendingQuery;prepare.onclick=()=>void session.prepare();selection.append(prepare);
      }
    }
    if(candidate) {
      const name=document.createElement("strong");name.textContent=candidate.title;
      const link=document.createElement("a");link.href=candidate.source.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent=t("nota.ia.verifiedOriginalSource");
      selection.append(name,paragraph(t('nota.ia.sourceCompared',{measures:candidate.measures,notes:candidate.notes})),paragraph(t('nota.ia.selectedPart',{part:candidate.source.part})),paragraph(candidate.scope),paragraph(t('nota.ia.validationMethod',{method:candidate.source.method})),paragraph(candidate.source.license),link);
    }
    open.disabled=session.phase !== "ready" || !candidate;
    reason.textContent=candidate ? t("nota.ia.openingProtectsYourCurrentDraft") : t("nota.ia.selectAnEditionAndFinish");
  }
  session.subscribe(render);
  onLangChange(render);
  navigation.subscribeNavigation(screen=>{if(screen === "search") {render();requestAnimationFrame(()=>query.focus());}});
  render();
  return {session,open:()=>navigation.showSearch()};
}
