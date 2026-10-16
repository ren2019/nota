import { t } from '../i18n';
import type { App } from '../editor/app';
import type { CurrentDocumentSession } from './document-session';
import type { DocumentDetail } from './detail';
import './practice-controls.css';

/** One set of already-bound Dolce playback controls, parked in the practice dock only while reading. */
export function mountPracticeControls(app: App, session: CurrentDocumentSession, detail: DocumentDetail): void {
  const root = document.getElementById('app')!;
  const pane = document.getElementById('score-pane')!;
  const dock = detail.practiceControls;
  dock.innerHTML = `<div class="nota-play-progress"></div><div class="nota-play-actions"><div class="nota-play-speed"></div><button type="button" class="nota-rewind" aria-label="${t("nota.ia.htmlBackToBeginning9")}" data-i18n-aria="nota.ia.htmlBackToBeginning9" title="${t("nota.ia.htmlBackToBeginning9")}" data-i18n-title="nota.ia.htmlBackToBeginning9">↤</button><div class="nota-play-main"></div><div class="nota-play-loop"></div><button type="button" class="nota-reading-open" aria-haspopup="dialog"><span data-i18n="nota.ia.htmlAa7">${t("nota.ia.htmlAa7")}</span><span><span data-i18n="nota.ia.htmlReading8">${t("nota.ia.htmlReading8")}</span></span></button></div>`;
  const targets = [
    ['play-progress','.nota-play-progress'], ['play-time','.nota-play-progress'],
    ['sel-speed','.nota-play-speed'], ['btn-play','.nota-play-main'], ['btn-loop','.nota-play-loop'],
  ] as const;
  const movable = targets.map(([id,target]) => {
    const control = document.getElementById(id)!;
    const node = id === 'sel-speed' ? control.closest('label')! : control;
    const marker = document.createComment(`original ${id}`);
    node.before(marker);
    return {node,marker,target:dock.querySelector(target)!};
  });
  const dialog = document.createElement('dialog');
  dialog.className='nota-reading-dialog';
  dialog.setAttribute('aria-labelledby','nota-reading-title');
  dialog.innerHTML=`<form method="dialog"><header><h2 id="nota-reading-title"><span data-i18n="nota.ia.htmlReading8">${t("nota.ia.htmlReading8")}</span></h2><button aria-label="${t("nota.ia.htmlCloseReadingSettings19")}" data-i18n-aria="nota.ia.htmlCloseReadingSettings19">×</button></header><label><span data-i18n="nota.ia.htmlScoreSize10">${t("nota.ia.htmlScoreSize10")}</span><select id="nota-reading-size"><option value="1"><span data-i18n="nota.ia.htmlFitScreenWidth11">${t("nota.ia.htmlFitScreenWidth11")}</span></option><option value="1.25"><span data-i18n="nota.ia.htmlZoom12">${t("nota.ia.htmlZoom12")}</span></option><option value="1.5"><span data-i18n="nota.ia.htmlZoom13">${t("nota.ia.htmlZoom13")}</span></option><option value="2"><span data-i18n="nota.ia.htmlZoom14">${t("nota.ia.htmlZoom14")}</span></option><option value="2.5"><span data-i18n="nota.ia.htmlZoom15">${t("nota.ia.htmlZoom15")}</span></option></select></label><label class="nota-reading-lyrics"><input type="checkbox" id="nota-reading-lyrics"><span data-i18n="nota.ia.htmlShowLyrics16">${t("nota.ia.htmlShowLyrics16")}</span></label><p><span data-i18n="nota.ia.htmlScreenReadingOnlySwipeSideways17">${t("nota.ia.htmlScreenReadingOnlySwipeSideways17")}</span></p><button class="nota-reading-done"><span data-i18n="nota.ia.htmlDone18">${t("nota.ia.htmlDone18")}</span></button></form>`;
  document.body.append(dialog);
  const size = dialog.querySelector<HTMLSelectElement>('#nota-reading-size')!;
  const lyrics = dialog.querySelector<HTMLInputElement>('#nota-reading-lyrics')!;
  const prefs = new Map<string,{scale:number;lyrics:boolean}>();
  let active=false;
  let visibleKey='';
  const current = () => {
    const key=detail.documentKey;
    let value=prefs.get(key);
    if(!value) { value={scale:matchMedia('(max-width:680px)').matches ? 1.5 : 1,lyrics:true}; prefs.set(key,value); }
    return value;
  };
  function applyReading() {
    const value=current();
    pane.style.setProperty('--nota-reading-scale',String(value.scale));
    app.setReadingLyrics(value.lyrics);
    size.value=String(value.scale); lyrics.checked=value.lyrics;
  }
  function sync() {
    const next=detail.screen === 'detail' && detail.mode === 'practice';
    if(next !== active) {
      if(!next) { app.playback.stop(); dialog.close(); app.setReadingLyrics(null); }
      for(const {node,marker,target} of movable) {
        if(next) target.append(node); else marker.after(node);
      }
      active=next;
    }
    if(next) {
      if(visibleKey !== detail.documentKey) { visibleKey=detail.documentKey; dialog.close(); }
      applyReading();
      app.playback.refreshSpeedUi();
    }
  }
  dock.querySelector<HTMLButtonElement>('.nota-rewind')!.onclick=() => app.playback.rewind();
  dock.querySelector<HTMLButtonElement>('.nota-reading-open')!.onclick=() => { applyReading(); dialog.showModal(); };
  size.onchange=() => {
    const value=current(); const ratio=Number(size.value)/value.scale;
    const top=pane.scrollTop, left=pane.scrollLeft;
    value.scale=Number(size.value); applyReading();
    requestAnimationFrame(() => {pane.scrollTop=top*ratio;pane.scrollLeft=left*ratio;});
  };
  lyrics.onchange=() => {current().lyrics=lyrics.checked;applyReading();};
  new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:['data-nota-screen','data-nota-mode']});
  session.subscribe(sync);
  sync();
}
