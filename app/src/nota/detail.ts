import type { App } from '../editor/app';
import type { CurrentDocumentSession } from './document-session';
import { showExportDialog } from '../editor/export';
import './detail.css';

export type DetailMode = 'practice' | 'edit';
export type DocumentScreen = 'library' | 'detail' | 'editor' | 'search';
let draftSequence = 0;
// Navigation identity only; LAN HTTP and older PWA browsers need no secure-context API.
const newDraftKey = () => `draft-${Date.now().toString(36)}-${++draftSequence}`;
interface Route { nota: true; screen: DocumentScreen; mode: DetailMode; id: string | null; draft: string }

/** Shell around the original DOM and App, never a second editor or a copy of the score. */
export function mountDocumentDetail(app: App, session: CurrentDocumentSession, refreshLibrary: () => void) {
  const root = document.getElementById('app')!;
  const start = document.getElementById('start-screen')!;
  const scorePane = document.getElementById('score-pane')!;
  const bar = document.createElement('section');
  bar.id = 'nota-document-head';
  bar.innerHTML = `<header class="nota-document-bar"><button type="button" id="nota-back" aria-label="返回曲谱库">‹</button><div class="nota-document-copy"><h1 id="nota-document-title"></h1><p id="nota-document-status" role="status"></p></div><div id="nota-document-actions"><button type="button" id="nota-detail-export">导出</button><button type="button" id="nota-detail-save">保存入库</button></div></header><nav class="nota-mode-tabs" aria-label="曲谱使用方式"><button type="button" data-mode="practice">练习</button><button type="button" data-mode="edit">编辑</button></nav>`;
  document.getElementById('app-header')!.after(bar);
  const dock = document.createElement('nav');
  dock.id = 'nota-edit-dock'; dock.setAttribute('aria-label','曲谱编辑操作');
  dock.innerHTML = `<button type="button" id="nota-detail-tune">♮<span>调式</span></button><button type="button" id="nota-edit-export">↥<span>导出</span></button><button type="button" id="nota-open-editor">✎<span>编辑</span></button>`;
  document.getElementById('statusbar')!.before(dock);
  const practiceControls = document.createElement('section');
  practiceControls.id = 'nota-practice-controls'; practiceControls.setAttribute('aria-label','练习控制');
  dock.before(practiceControls);
  // Until T2 migrates the native screen, this real return path keeps every existing Dolce tool available.
  const editorBack = document.createElement('button');
  editorBack.type='button'; editorBack.id='nota-editor-back'; editorBack.className='button button-secondary'; editorBack.textContent='返回曲谱详情';
  document.querySelector('.header-left')!.append(editorBack);
  const query = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
  const saveButton = query<HTMLButtonElement>('nota-detail-save');
  const exportButton = query<HTMLButtonElement>('nota-detail-export');
  const tuneButton = query<HTMLButtonElement>('nota-detail-tune');
  const editButton = query<HTMLButtonElement>('nota-open-editor');
  const actionSlot = query<HTMLElement>('nota-document-actions');
  let screen: DocumentScreen = 'library';
  let mode: DetailMode = 'practice';
  let draft = newDraftKey();
  let navigating = false;
  const navigationListeners = new Set<(screen:DocumentScreen,mode:DetailMode) => void>();
  const positions = new Map<string,number>();
  const key = () => session.current?.id ?? draft;
  let visibleKey = key();
  const route = (): Route => ({nota:true,screen,mode,id:session.current?.id ?? null,draft});
  const rememberPosition = () => { if (screen === 'detail' || screen === 'editor') positions.set(visibleKey,scorePane.scrollTop); };
  const urlOf = (r:Route) => {
    const url = new URL(location.href);
    for (const param of ['song','mode','screen']) url.searchParams.delete(param);
    if (r.screen !== 'library') {
      url.searchParams.set('screen',r.screen); url.searchParams.set('mode',r.mode);
      if (r.id) url.searchParams.set('song',r.id);
    }
    return url;
  };
  function refresh() {
    query('nota-document-title').textContent = session.title;
    const status = session.current ? (session.dirty ? '有未保存的修改' : '曲谱库 · 已保存') : '当前稿 · 尚未保存入库';
    query('nota-document-status').textContent = session.recovered ? `自动恢复稿 · ${status}` : status;
    saveButton.hidden = mode !== 'edit'; exportButton.hidden = mode !== 'practice';
    bar.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => {
      const active = button.dataset.mode === mode;
      button.classList.toggle('selected',active); button.setAttribute('aria-pressed',String(active));
    });
  }
  function display(next:DocumentScreen, nextMode=mode) {
    rememberPosition();
    if (nextMode === 'edit' || next === 'library' || next === 'search') app.playback.stop();
    screen=next; mode=nextMode; visibleKey=key();
    delete root.dataset.notaTool;
    root.dataset.notaScreen=screen; root.dataset.notaMode=mode;
    start.hidden=screen !== 'library'; root.classList.toggle('is-starting',screen === 'library');
    if (screen === 'library') { app.playback.stop(); refreshLibrary(); }
    // Hidden code panels must not retain focus/keyboard editing when switching into reading.
    if (screen === 'detail' && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    refresh();
    navigationListeners.forEach(listener => listener(screen,mode));
    requestAnimationFrame(() => { if(screen !== 'library') scorePane.scrollTop=positions.get(key()) ?? 0; });
  }
  function navigate(next:DocumentScreen,nextMode=mode,replace=false) {
    display(next,nextMode); const r=route();
    if(replace) history.replaceState(r,'',urlOf(r)); else history.pushState(r,'',urlOf(r));
  }
  async function restore(r:Route) {
    if(navigating) return;
    navigating=true;
    try {
      if ((r.screen === 'detail' || r.screen === 'editor') && r.id && r.id !== session.current?.id) {
        if (!(await app.confirmReplace())) { history.pushState(route(),'',urlOf(route())); return; }
        await session.openLibrary(r.id);
      } else if ((r.screen === 'detail' || r.screen === 'editor') && !r.id && r.draft !== draft) throw new Error('这份临时稿已无法恢复，请从曲谱库重新打开。');
      display(r.screen,r.mode);
      history.replaceState(route(),'',urlOf(route()));
    } catch(e) {
      display('library');
      const feedback = query('start-feedback'); feedback.textContent=e instanceof Error ? e.message : String(e); feedback.hidden=false;
      history.replaceState(route(),'',urlOf(route()));
    } finally {navigating=false;}
  }
  bar.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.onclick=() => navigate('detail',button.dataset.mode as DetailMode));
  query('nota-back').onclick=() => navigate('library');
  editorBack.onclick=() => navigate('detail','edit');
  saveButton.onclick=() => void app.saveFile();
  exportButton.onclick=() => showExportDialog(app);
  query('nota-edit-export').onclick=() => showExportDialog(app);
  editButton.onclick=() => navigate('editor','edit');
  tuneButton.onclick=() => { navigate('editor','edit'); root.dataset.notaTool='tune'; document.getElementById('nota-practice')?.scrollIntoView({block:'nearest'}); };
  window.addEventListener('popstate',event => {
    const r=event.state as Route | null;
    void restore(r?.nota ? r : {nota:true,screen:'library',mode:'practice',id:null,draft});
  });
  scorePane.addEventListener('keydown', event => {
    if (screen === 'detail') event.stopImmediatePropagation();
  }, {capture:true});
  session.subscribe(refresh);
  // App's render/status events mutate this element after text, undo, layout and format changes.
  new MutationObserver(refresh).observe(document.getElementById('status')!,{childList:true,characterData:true,subtree:true});
  const initialUrl=new URL(location.href);
  const initialId=initialUrl.searchParams.get('song');
  const initialScreen=initialUrl.searchParams.get('screen');
  display('library','practice');
  history.replaceState(route(),'',initialUrl);
  return {
    session, practiceControls, actionSlot, saveButton, exportButton, tuneButton, editButton,
    get screen(){return screen;}, get mode(){return mode;}, get documentKey(){return key();},
    refresh,
    subscribeNavigation(listener:(screen:DocumentScreen,mode:DetailMode) => void) {
      navigationListeners.add(listener); return () => navigationListeners.delete(listener);
    },
    open(nextMode:DetailMode='edit') { if(!session.current) draft=newDraftKey(); navigate('detail',nextMode); },
    home(replace=false){navigate('library',mode,replace);},
    showSearch(){navigate('search');},
    showEditor(){navigate('editor','edit');},
    showDetail(nextMode:DetailMode=mode){navigate('detail',nextMode);},
    async restoreInitialRoute(){
      if(initialScreen === 'search') {navigate('search',mode,true);return;}
      if(initialScreen === 'detail' || initialScreen === 'editor') {
        if(!initialId) {
          const feedback=query('start-feedback'); feedback.textContent='这份临时稿已无法恢复，请从曲谱库重新打开。'; feedback.hidden=false;
          history.replaceState(route(),'',urlOf(route())); return;
        }
        await restore({nota:true,screen:initialScreen,mode:initialUrl.searchParams.get('mode') === 'edit' ? 'edit' : 'practice',id:initialId,draft});
      }
    },
  };
}
export type DocumentDetail = ReturnType<typeof mountDocumentDetail>;
