import type { App } from '../editor/app';
import type { CurrentDocumentSession } from './document-session';
import type { DocumentDetail } from './detail';
import { onLangChange, t } from '../i18n';
import './editor-page.css';

/** Adds document identity to the original Dolce workbench; none of its tools or DOM are replaced. */
export function mountEditorPage(app:App, session:CurrentDocumentSession, detail:DocumentDetail):void {
  const root=document.getElementById('app')!;
  const header=document.createElement('section');
  header.id='nota-editor-context';
  header.setAttribute('aria-label',t('nota.editor.context'));
  const back=document.getElementById('nota-editor-back')!;
  const copy=document.createElement('div'); copy.className='nota-editor-identity';
  const title=document.createElement('strong');
  const status=document.createElement('span');
  const print=document.createElement('span'); print.className='nota-editor-print-title';
  copy.append(title,status,print); header.append(back,copy);
  document.getElementById('app-header')!.after(header);
  const original=document.getElementById('omr-side')!;
  const follow=document.getElementById('omr-follow')!;
  const pane=document.getElementById('score-pane')!;
  const heading=document.querySelector<HTMLElement>('#score-pane-shell > .pane-heading > span')!;
  heading.removeAttribute('data-i18n');
  function refresh() {
    title.textContent=session.title;
    const statusText=session.current ? t(session.dirty ? 'nota.editor.unsaved' : 'nota.editor.saved') : t('nota.editor.draft');
    status.textContent=statusText;
    print.textContent=t('nota.editor.printTitle',{title:app.documentTitle() || '—'});
    back.textContent=t('nota.editor.back');
    const originalView=app.mode === 'recognize';
    const surface=t(originalView ? 'nota.editor.sourceReview' : 'nota.editor.current');
    heading.textContent=surface;
    const pages=Array.from(pane.querySelectorAll<HTMLElement>(':scope > .score-page-wrap'));
    pages.forEach((page,index) => {
      const label=pages.length > 1 ? t('nota.editor.page',{kind:surface,page:index+1,total:pages.length}) : surface;
      page.dataset.notaPageLabel=pages.length > 1 ? label : '';
      page.setAttribute('aria-label',label);
    });
    original.setAttribute('aria-label',t('nota.editor.source'));
    original.dataset.notaRegion=t('nota.editor.source');
    follow.setAttribute('aria-label',t('nota.editor.sourceFragment'));
    follow.dataset.notaRegion=t('nota.editor.sourceFragment');
    const sourcePages=original.querySelectorAll<SVGSVGElement>(':scope > svg.omr-side-page');
    sourcePages.forEach((page,index) => {
      const label=t('nota.editor.page',{kind:t('nota.editor.source'),page:index+1,total:sourcePages.length});
      let marker=page.previousElementSibling;
      if(!marker?.classList.contains('nota-source-page-marker')) {
        marker=document.createElement('div'); marker.className='nota-source-page-marker'; page.before(marker);
      }
      if(marker.textContent !== label) marker.textContent=label;
    });
  }
  const refreshIfEditor=() => { if(detail.screen === 'editor') refresh(); };
  session.subscribe(refreshIfEditor);
  detail.subscribeNavigation(screen => {
    if(screen !== 'editor') return;
    refresh();
    // Preserve editor/view/history and let CodeMirror remeasure after its pane becomes visible.
    requestAnimationFrame(() => app.view.requestMeasure());
  });
  onLangChange(refresh);
  new MutationObserver(refreshIfEditor).observe(pane,{childList:true});
  new MutationObserver(refreshIfEditor).observe(original,{childList:true});
  new MutationObserver(refreshIfEditor).observe(document.getElementById('status')!,{childList:true,characterData:true,subtree:true});
  // The added explanation is screen-only. It never enters document text or export SVGs.
  root.dataset.notaEditor='dolce';
}
