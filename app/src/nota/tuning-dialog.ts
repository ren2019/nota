import type { App } from '../editor/app';
import type { ProjectSnapshot } from '../editor/omrproject';
import type { FormatSource } from '../editor/formatswitch';
import type { ViewMode } from '../editor/app';
import type { CurrentDocumentSession } from './document-session';
import type { DocumentDetail } from './detail';
import { openModal } from '../editor/dialogs';
import { KEYS, keyLabel, type ConversionMode } from './convert';
import { canRestoreTuning, prepareTuning, restoreTuning, type TuningDraft, type TuningChange } from './tuning';
import './tuning-dialog.css';

interface Previous extends TuningChange { project:ProjectSnapshot | null; source:FormatSource | null; path:string | null; view:ViewMode }
/** The dialog edits the one real App. Conversion preparation is synchronous and loss-checked before any write. */
export function mountTuning(app:App, session:CurrentDocumentSession, detail:DocumentDetail):void {
  let previous:Previous | null=null;
  let target=0;
  let mode:ConversionMode='renotate';
  const draft = ():TuningDraft => ({key:detail.documentKey,format:app.docFormat,text:app.getText(),context:JSON.stringify(app.omr.snapshot())});
  async function restoreOriginal(item:Previous) {
    if(item.project) await app.omr.restore(structuredClone(item.project));
    else if(app.docFormat === item.before.format) app.replaceText(item.before.text,'input.nota.restore');
    else app.adoptText(item.before.format,item.before.text,item.path);
    app.filePath=item.path;
    app.formats.use(item.source);
    await app.setViewMode(item.view);
    await app.whenIdle();
  }
  detail.tuneButton.onclick=() => {
    const body=document.createElement('div'); body.className='nota-tuning-body';
    const current=document.createElement('p'); current.className='nota-tuning-current';
    const song=app.scoreDoc()?.songs[0]; current.textContent=song ? `当前记谱 1=${keyLabel(song.key?.fifths ?? 0)}` : '请先打开一份曲谱';
    const methods=document.createElement('fieldset'); methods.className='nota-tuning-modes';
    methods.innerHTML=`<legend class="sr-only">转换方式</legend><label><input type="radio" name="nota-tuning-mode" value="renotate"><span>保持音高，重新记谱<small>声音与音区不变，重算数字和升降号</small></span></label><label><input type="radio" name="nota-tuning-mode" value="transpose"><span>实际移调<small>数字关系保留，声音随目标调改变</small></span></label>`;
    methods.querySelectorAll<HTMLInputElement>('input').forEach(input => {input.checked=input.value === mode;input.onchange=() => {mode=input.value as ConversionMode;};});
    const label=document.createElement('label'); label.className='nota-tuning-target';label.append('目标基准');
    const select=document.createElement('select');select.setAttribute('aria-label','目标基准');
    for(const key of KEYS) {const option=document.createElement('option');option.value=String(key.fifths);option.textContent=`1=${key.name}`;select.append(option);}
    select.value=String(target);select.onchange=() => {target=Number(select.value);};label.append(select);
    const feedback=document.createElement('p'); feedback.className='nota-tuning-feedback';feedback.setAttribute('role','status');feedback.hidden=true;
    const restore=document.createElement('button');restore.type='button';restore.className='modal-button';restore.textContent='还原本次转换';
    const apply=document.createElement('button');apply.type='button';apply.className='modal-button-primary';apply.textContent='应用并预览';
    const cancel=document.createElement('button');cancel.type='button';cancel.className='modal-button';cancel.textContent='关闭';
    const hint=document.createElement('p');hint.className='nota-tuning-hint';hint.textContent='当前支持单首、单声部、单旋律；应用后仍需保存入库。';
    body.append(current,methods,label,hint,feedback,restore);
    let busy=false;
    const refresh=() => {
      restore.disabled=busy || !previous || !canRestoreTuning(previous,draft());
      if(previous && restore.disabled && !busy) restore.title='转换后的曲谱或原图已修改，请使用专业编辑的撤销';
      apply.disabled=busy || !app.scoreDoc()?.songs.length;
    };
    const error=(value:unknown) => {feedback.textContent=value instanceof Error ? value.message : String(value);feedback.hidden=false;feedback.classList.add('is-error');};
    const observer=new MutationObserver(refresh);observer.observe(app.scorePane,{childList:true});
    const {close}=openModal({title:'调式',boxClass:'nota-tuning-box',body:[body],footer:[cancel,apply],onClose:() => observer.disconnect()});
    cancel.onclick=close;
    const run=async(work:() => Promise<void>) => {
      if(busy) return;busy=true;refresh();select.disabled=true;methods.disabled=true;cancel.disabled=true;
      try {await work();} catch(e) {error(e);} finally {busy=false;select.disabled=false;methods.disabled=false;cancel.disabled=false;refresh();}
    };
    apply.onclick=() => void run(async() => {
      app.playback.stop();await app.whenIdle();
      const before=draft(); const doc=app.scoreDoc();
      if(!doc) throw new Error('这份曲谱暂时无法转换，请先核对原稿。');
      const source=app.convertTo('123');
      if(!source) throw new Error('这份原格式暂时不能无损转换为简谱，原稿保持不变。');
      const result=prepareTuning(before,doc,source,target,mode,app.jianpuAccidentals);
      const snapshot:Previous={before,after:before,project:structuredClone(app.omr.snapshot()),source:app.formats.source,path:app.filePath,view:app.viewMode};
      try {
        if(app.docFormat === '123') app.replaceText(result.text,'input.nota');
        else {app.adoptText('123',result.text,null);app.formats.use(null);}
        await app.setViewMode('original'); await app.whenIdle();
        if(detail.documentKey !== before.key || app.docFormat !== '123' || app.getText() !== result.text || !app.scoreDoc()?.songs.length) throw new Error('转换后的曲谱无法排版，已恢复原稿。');
      } catch(e) {if(detail.documentKey === before.key && app.docFormat === '123' && app.getText() === result.text) await restoreOriginal(snapshot);throw e;}
      snapshot.after=draft();previous=snapshot;
      session.notify();detail.refresh();
      app.setStatus(`${result.sourceKey} → ${result.targetKey} · ${mode === 'renotate' ? '音高与音区保持不变' : `实际音高${result.shift < 0 ? '降低' : '升高'} ${Math.abs(result.shift)} 个半音`}${result.warning ? ` · ${result.warning}` : ''} · 尚未保存入库`);
      close();
    });
    restore.onclick=() => void run(async() => {
      if(!previous) return;
      restoreTuning(previous,draft());
      app.playback.stop();await restoreOriginal(previous);previous=null;
      session.notify();detail.refresh();app.setStatus('已还原本次转换前的曲谱；请确认后保存入库。');close();
    });
    refresh();
  };
}
