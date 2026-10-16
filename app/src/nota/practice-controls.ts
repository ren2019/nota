import type { App } from '../editor/app';
import type { CurrentDocumentSession } from './document-session';
import type { DocumentDetail } from './detail';
import './practice-controls.css';

/** One set of already-bound Dolce playback controls, parked in the practice dock only while reading. */
export function mountPracticeControls(app: App, session: CurrentDocumentSession, detail: DocumentDetail): void {
  const root = document.getElementById('app')!;
  const pane = document.getElementById('score-pane')!;
  const dock = detail.practiceControls;
  dock.innerHTML = `<div class="nota-play-progress"></div><div class="nota-play-actions"><div class="nota-play-speed"></div><button type="button" class="nota-rewind" aria-label="回到开头" title="回到开头">↤</button><div class="nota-play-main"></div><div class="nota-play-loop"></div><button type="button" class="nota-reading-open" aria-haspopup="dialog">字<span>阅读</span></button></div>`;
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
  dialog.innerHTML=`<form method="dialog"><header><h2 id="nota-reading-title">阅读</h2><button aria-label="关闭阅读设置">×</button></header><label>谱面大小<select id="nota-reading-size"><option value="1">适合屏宽</option><option value="1.25">放大 125%</option><option value="1.5">放大 150%</option><option value="2">放大 200%</option><option value="2.5">放大 250%</option></select></label><label class="nota-reading-lyrics"><input type="checkbox" id="nota-reading-lyrics"> 显示歌词</label><p>只影响屏幕阅读。放大后可左右滑动看谱，打印设置不变。</p><button class="nota-reading-done">完成</button></form>`;
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
  function markLyrics() {
    // The renderer's public identity lookup also covers staff/mixed leaf glyphs.
    for(const song of app.scoreDoc()?.songs ?? []) for(const part of song.parts) for(const measure of part.measures) for(const element of measure.elements) {
      if(element.kind !== 'chord') continue;
      for(const lyric of element.lyrics ?? []) for(const node of app.painter.lyricEls(element.id,lyric.number)) node.classList.add('nota-reading-lyric');
    }
  }
  function applyReading() {
    const value=current();
    pane.style.setProperty('--nota-reading-scale',String(value.scale));
    pane.classList.toggle('nota-reading-hide-lyrics',!value.lyrics);
    size.value=String(value.scale); lyrics.checked=value.lyrics;
    markLyrics();
  }
  function sync() {
    const next=detail.screen === 'detail' && detail.mode === 'practice';
    if(next !== active) {
      if(!next) { app.playback.stop(); dialog.close(); }
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
  new MutationObserver(() => {if(active) markLyrics();}).observe(pane,{childList:true,subtree:true});
  session.subscribe(sync);
  sync();
}
