import { t } from '../i18n';
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
    const song=app.scoreDoc()?.songs[0]; current.textContent=song ? t('nota.ia.currentReference',{key:keyLabel(song.key?.fifths ?? 0)}) : t("nota.ia.openAScoreFirst");
    const methods=document.createElement('fieldset'); methods.className='nota-tuning-modes';
    methods.innerHTML=`<legend class="sr-only"><span data-i18n="nota.ia.htmlConversionMethod20">${t("nota.ia.htmlConversionMethod20")}</span></legend><label><input type="radio" name="nota-tuning-mode" value="renotate"><span><span data-i18n="nota.ia.htmlKeepPitchesRenotate21">${t("nota.ia.htmlKeepPitchesRenotate21")}</span><small><span data-i18n="nota.ia.htmlKeepSoundAndRegisterRecalculate22">${t("nota.ia.htmlKeepSoundAndRegisterRecalculate22")}</span></small></span></label><label><input type="radio" name="nota-tuning-mode" value="transpose"><span><span data-i18n="nota.ia.htmlTranspose23">${t("nota.ia.htmlTranspose23")}</span><small><span data-i18n="nota.ia.htmlKeepDegreeRelationshipsChangeSound24">${t("nota.ia.htmlKeepDegreeRelationshipsChangeSound24")}</span></small></span></label>`;
    methods.querySelectorAll<HTMLInputElement>('input').forEach(input => {input.checked=input.value === mode;input.onchange=() => {mode=input.value as ConversionMode;};});
    const label=document.createElement('label'); label.className='nota-tuning-target';label.append(t("nota.ia.targetReference"));
    const select=document.createElement('select');select.setAttribute('aria-label',t("nota.ia.targetReference"));
    for(const key of KEYS) {const option=document.createElement('option');option.value=String(key.fifths);option.textContent=`1=${key.name}`;select.append(option);}
    select.value=String(target);select.onchange=() => {target=Number(select.value);};label.append(select);
    const feedback=document.createElement('p'); feedback.className='nota-tuning-feedback';feedback.setAttribute('role','status');feedback.hidden=true;
    const restore=document.createElement('button');restore.type='button';restore.className='modal-button';restore.textContent=t("nota.ia.restoreThisConversion");
    const apply=document.createElement('button');apply.type='button';apply.className='modal-button-primary';apply.textContent=t("nota.ia.applyAndPreview");
    const cancel=document.createElement('button');cancel.type='button';cancel.className='modal-button';cancel.textContent=t("nota.ia.close");
    const hint=document.createElement('p');hint.className='nota-tuning-hint';hint.textContent=t("nota.ia.supportsOneSongOnePart");
    body.append(current,methods,label,hint,feedback,restore);
    let busy=false;
    const refresh=() => {
      restore.disabled=busy || !previous || !canRestoreTuning(previous,draft());
      if(previous && restore.disabled && !busy) restore.title=t("nota.ia.theScoreOrOriginalImages51");
      apply.disabled=busy || !app.scoreDoc()?.songs.length;
    };
    const error=(value:unknown) => {feedback.textContent=value instanceof Error ? value.message : String(value);feedback.hidden=false;feedback.classList.add('is-error');};
    const observer=new MutationObserver(refresh);observer.observe(app.scorePane,{childList:true});
    const {close}=openModal({title:t("nota.ia.keyAndNotation"),boxClass:'nota-tuning-box',body:[body],footer:[cancel,apply],onClose:() => observer.disconnect()});
    cancel.onclick=close;
    const run=async(work:() => Promise<void>) => {
      if(busy) return;busy=true;refresh();select.disabled=true;methods.disabled=true;cancel.disabled=true;
      try {await work();} catch(e) {error(e);} finally {busy=false;select.disabled=false;methods.disabled=false;cancel.disabled=false;refresh();}
    };
    apply.onclick=() => void run(async() => {
      app.playback.stop();await app.whenIdle();
      const before=draft(); const doc=app.scoreDoc();
      if(!doc) throw new Error(t("nota.ia.thisScoreCannotBeConverted53"));
      const source=app.convertTo('123');
      if(!source) throw new Error(t("nota.ia.thisFormatCannotBeConverted"));
      const result=prepareTuning(before,doc,source,target,mode,app.jianpuAccidentals);
      const snapshot:Previous={before,after:before,project:structuredClone(app.omr.snapshot()),source:app.formats.source,path:app.filePath,view:app.viewMode};
      try {
        if(app.docFormat === '123') app.replaceText(result.text,'input.nota');
        else {app.adoptText('123',result.text,null);app.formats.use(null);}
        await app.setViewMode('original'); await app.whenIdle();
        if(detail.documentKey !== before.key || app.docFormat !== '123' || app.getText() !== result.text || !app.scoreDoc()?.songs.length) throw new Error(t("nota.ia.theConvertedScoreCouldNot"));
      } catch(e) {if(detail.documentKey === before.key && app.docFormat === '123' && app.getText() === result.text) await restoreOriginal(snapshot);throw e;}
      snapshot.after=draft();previous=snapshot;
      session.notify();detail.refresh();
      app.setStatus(t('nota.ia.tuningApplied',{source:result.sourceKey,target:result.targetKey,change:mode === 'renotate' ? t('nota.ia.tuningKeptPitches') : t('nota.ia.tuningShift',{direction:t(result.shift < 0 ? 'nota.ia.tuningDown' : 'nota.ia.tuningUp'),count:Math.abs(result.shift)}),warning:result.warning ? ` · ${result.warning}` : ''}));
      close();
    });
    restore.onclick=() => void run(async() => {
      if(!previous) return;
      restoreTuning(previous,draft());
      app.playback.stop();await restoreOriginal(previous);previous=null;
      session.notify();detail.refresh();app.setStatus(t("nota.ia.restoredTheScoreBeforeThis"));close();
    });
    refresh();
  };
}
