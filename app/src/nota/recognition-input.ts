import type {App} from '../editor/app';
import type {RecogInput} from '../editor/omrctl';
import {showPagesDialog} from '../editor/omrpages';
import {t} from '../i18n';

/** Choose files first; all recognition type, rotation/crop/order controls live in the existing page editor. */
export function prepareRecognitionFiles(app:App,files:readonly RecogInput[]):Promise<RecogInput[] | null> {
  if(!files.length) return Promise.resolve(null);
  return new Promise(resolve => {
    const header=document.createElement('div'); header.className='nota-recognition-setup';
    const label=document.createElement('label'); label.textContent=t("nota.ia.recognizeAs");
    const kind=document.createElement('select'); kind.setAttribute('aria-label',t("nota.ia.recognitionTypeForThisInput"));
    for(const value of ['auto','jianpu','staff'] as const) {
      const option=document.createElement('option');option.value=value;option.textContent=t(`recogKind.${value}`);kind.append(option);
    }
    kind.value=app.omr.kind;label.append(kind);
    const scope=document.createElement('p');scope.setAttribute('role','status');scope.style.cssText='font-size:12px;line-height:1.6;margin:8px 0;color:var(--text-secondary)';
    const update=(list:readonly RecogInput[]) => {
      if(!list.length) {scope.textContent=t("nota.ia.keepAtLeastOneImage");return;}
      const first=list[0]?.name ?? t("nota.ia.firstFile");
      scope.textContent=kind.value === 'jianpu'
        ? t('nota.ia.recognitionJianpuScope',{file:first,others:list.length > 1 ? t('nota.ia.recognitionOtherFiles',{count:list.length-1}) : ''})
        : kind.value === 'staff'
          ? t('nota.ia.recognitionStaffScope',{count:list.length})
          : t('nota.ia.recognitionAutoScope',{file:first});
    };
    let current=files;
    kind.onchange=() => update(current);
    header.append(label,scope);
    showPagesDialog(files,list => {
      if(!list.length) {app.setStatus(t("nota.ia.noOriginalSelectedTheCurrent"));resolve(null);return;}
      app.omr.setInputKind(kind.value as 'auto' | 'jianpu' | 'staff');
      resolve(list);
    },{header,onListChange:list => {current=list;update(list);},okLabel:t("nota.ia.startRecognition"),hint:t("nota.ia.rotateCropOrReorderImages"),onCancel:() => resolve(null)});
  });
}
