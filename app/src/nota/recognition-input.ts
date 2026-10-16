import type {App} from '../editor/app';
import type {RecogInput} from '../editor/omrctl';
import {showPagesDialog} from '../editor/omrpages';
import {t} from '../i18n';

/** Choose files first; all recognition type, rotation/crop/order controls live in the existing page editor. */
export function prepareRecognitionFiles(app:App,files:readonly RecogInput[]):Promise<RecogInput[] | null> {
  if(!files.length) return Promise.resolve(null);
  return new Promise(resolve => {
    const header=document.createElement('div'); header.className='nota-recognition-setup';
    const label=document.createElement('label'); label.textContent='识别为 ';
    const kind=document.createElement('select'); kind.setAttribute('aria-label','本次识别类型');
    for(const value of ['auto','jianpu','staff'] as const) {
      const option=document.createElement('option');option.value=value;option.textContent=t(`recogKind.${value}`);kind.append(option);
    }
    kind.value=app.omr.kind;label.append(kind);
    const scope=document.createElement('p');scope.setAttribute('role','status');scope.style.cssText='font-size:12px;line-height:1.6;margin:8px 0;color:var(--text-secondary)';
    const update=(list:readonly RecogInput[]) => {
      if(!list.length) {scope.textContent='请至少保留一份图片或 PDF。';return;}
      const first=list[0]?.name ?? '第一个文件';
      scope.textContent=kind.value === 'jianpu'
        ? `简谱：本次仅识别「${first}」的第 1 页${list.length > 1 ? `；其余 ${list.length-1} 个文件不会识别` : ''}。请先把需要的页排在首位。`
        : kind.value === 'staff'
          ? `五线谱：按当前识别流程处理这 ${list.length} 个文件中的页面，完成后显示实际识别与跳过情况。`
          : `自动判断：五线谱按页面处理；若判断为简谱，仅处理「${first}」第 1 页。其余页不会自动合并成简谱。`;
    };
    let current=files;
    kind.onchange=() => update(current);
    header.append(label,scope);
    showPagesDialog(files,list => {
      if(!list.length) {app.setStatus('未选择原图，当前稿保持不变。');resolve(null);return;}
      app.omr.setInputKind(kind.value as 'auto' | 'jianpu' | 'staff');
      resolve(list);
    },{header,onListChange:list => {current=list;update(list);},okLabel:'开始识别',hint:'可以旋转、裁剪图片，或调整文件顺序。PDF 可调整文件顺序；识别结果仍需人工核对。取消会保留当前曲谱。',onCancel:() => resolve(null)});
  });
}
