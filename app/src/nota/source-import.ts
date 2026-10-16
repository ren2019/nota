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
  if(!launch) { launch=document.createElement("button");launch.type="button";launch.className="library-refresh";launch.textContent="联网查谱";launch.id="nota-find-score";document.querySelector(".library-heading")!.append(launch); }
  launch.onclick=()=>navigation.showSearch();
  const page=document.createElement("section");page.id="nota-score-search";
  page.innerHTML=`<header class="nota-search-head"><button type="button" class="nota-search-back" aria-label="返回曲谱库">‹</button><div><h1>联网查谱</h1><p>搜索已接入的 OpenScore 歌曲库及精选来源</p></div></header><div class="nota-search-scroll"><p class="nota-search-intro">先查找版本，再下载并校验旋律。仅浏览不会替换当前曲谱；明确打开后才能编辑，保存才入库。</p><form class="nota-source-form"><label class="sr-only" for="nota-source-query">曲名或作者</label><input id="nota-source-query" type="search" placeholder="输入曲名或作者" autocomplete="off"><button type="submit">搜索</button></form><p class="nota-search-status" role="status" aria-live="polite"></p><h2 class="nota-search-results-title"></h2><div class="nota-search-results"></div><section class="nota-search-selection"></section><details class="nota-external-source"><summary>导入曲谱候选文件</summary><p>接收 .nota-score.json / .json 文件，须包含原始谱本、来源与许可。仍会联网重新核对原谱，校验通过才能打开。</p><input id="nota-source-file" type="file" accept=".json,.nota-score.json" aria-label="选择曲谱候选文件"></details><p class="nota-search-scope">馆藏范围：固定版本的 OpenScore Lieder 结构化歌曲谱及精选来源。并非全网搜索；最多返回 20 条 OpenScore 结果，另含匹配的精选来源。搜索命中尚未验证可导入。</p></div><footer class="nota-search-actions"><p class="nota-search-open-reason"></p><button type="button" class="nota-source-adopt">打开并校对</button></footer>`;
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
    search.textContent=session.phase === "searching" ? "搜索中…" : "搜索";
    status.classList.toggle("is-error",!!session.error);
    status.textContent=session.error || (session.pendingQuery ? "输入尚未提交，请点击搜索。下方仍是上次查询。" : {
      idle:"输入曲名或作者后搜索。",searching:"正在检索结构化曲谱索引…",results:"选择一个相关版本，查看来源后准备。",empty:"没有找到匹配的候选。可换用曲名或作者，或使用候选文件。",preparing:"正在下载原谱，独立核对音高、八度、时值、起音与结构…",ready:"源数据对照通过；请核对版本后打开。",adopting:"正在处理当前稿，请完成保存或替换选择。",error:"检索或校验失败，请重试。",
    }[session.phase]);
    title.hidden=!session.query;
    title.textContent=session.phase === "searching" || (session.phase === "error" && !session.items.length) ? `查询“${session.query}”` : `“${session.query}” · 返回 ${session.items.length} 个候选`;
    list.replaceChildren();selection.replaceChildren();
    for(const item of session.items) {
      const row=document.createElement("button");row.type="button";row.className="nota-source-result";
      const selected=session.selected?.url === item.url;
      row.classList.toggle("selected",selected);row.setAttribute("aria-pressed",String(selected));row.disabled=busy || session.pendingQuery;
      const name=document.createElement("strong");name.textContent=item.title;
      const author=document.createElement("span");author.textContent=item.composer || "作者与版本见来源";
      const edition=document.createElement("small");edition.textContent=[item.edition,item.sourceName || new URL(item.url).hostname].filter(Boolean).join(" · ");
      row.append(name,author,edition);row.onclick=()=>session.select(item);list.append(row);
      if(selected) list.append(selection);
    }
    if(!selection.isConnected || selection.parentElement !== list) list.after(selection);
    const chosen=session.selected, candidate=session.candidate;
    selection.hidden=!chosen && !candidate && session.phase !== "preparing";
    if(chosen) {
      selection.append(paragraph(chosen.title),paragraph(chosen.license));
      const source=document.createElement("a");source.href=chosen.url;source.target="_blank";source.rel="noopener noreferrer";source.textContent="查看来源文件";selection.append(source);
      if(!candidate) {
        selection.append(paragraph("尚未读取原谱。准备后将检查所选旋律声部，不能预先保证适用。"));
        const prepare=document.createElement("button");prepare.type="button";prepare.textContent=session.phase === "preparing" ? "正在下载并校验…" : "下载并校验此版本";prepare.disabled=session.phase === "preparing" || busy || session.pendingQuery;prepare.onclick=()=>void session.prepare();selection.append(prepare);
      }
    }
    if(candidate) {
      const name=document.createElement("strong");name.textContent=candidate.title;
      const link=document.createElement("a");link.href=candidate.source.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="已核对的原始来源";
      selection.append(name,paragraph(`源数据对照通过 · ${candidate.measures} 小节 · ${candidate.notes} 个音符（含倚音）`),paragraph(`已选声部：${candidate.source.part}`),paragraph(candidate.scope),paragraph(`校验方式：${candidate.source.method}。与此数字谱本一致，仍请核对曲谱版本。`),paragraph(candidate.source.license),link);
    }
    open.disabled=session.phase !== "ready" || !candidate;
    reason.textContent=candidate ? "打开会先保护当前稿；不会自动入库。" : "请先选择版本并完成下载校验。";
  }
  session.subscribe(render);
  navigation.subscribeNavigation(screen=>{if(screen === "search") {render();requestAnimationFrame(()=>query.focus());}});
  render();
  return {session,open:()=>navigation.showSearch()};
}
