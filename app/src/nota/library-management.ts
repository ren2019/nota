import type { App } from '../editor/app';
import type { DocumentDetail } from './detail';
import { CurrentDocumentSession, LibraryError, renameLibraryScore, deleteLibraryScore, type LibraryItem } from './document-session';
import { openModal } from '../editor/dialogs';
import './library-management.css';

const button=(label:string,run?:() => void) => {const el=document.createElement('button');el.type='button';el.textContent=label;if(run) el.onclick=run;return el;};
function failure(error:unknown):string {
  const message=error instanceof Error ? error.message : String(error);
  return error instanceof LibraryError && (error.status === 409 || error.status === 404) ? `${message} 当前稿仍保留。请关闭后返回曲谱库重新打开，或保存为副本。` : message;
}
/** Metadata operations never submit App.getText(); all write/delete responses are revision checked. */
export function mountLibraryManagement(app:App,session:CurrentDocumentSession,detail:DocumentDetail,refreshLibrary:() => Promise<void>):void {
  const more=button('⋯');more.id='nota-library-more';more.setAttribute('aria-label','更多曲谱操作');more.setAttribute('aria-haspopup','dialog');more.setAttribute('aria-expanded','false');
  detail.actionSlot.append(more);
  function openRename(item:LibraryItem) {
    const body=document.createElement('div');body.className='nota-management-body';
    const label=document.createElement('label');label.textContent='曲谱库名称';
    const input=document.createElement('input');input.type='text';input.value=item.title;input.maxLength=120;input.required=true;input.setAttribute('aria-label','曲谱库名称');label.append(input);
    const hint=document.createElement('p');hint.textContent='只修改库中的名称；谱面标题和当前未保存的编辑保持原样。';
    const feedback=document.createElement('p');feedback.className='nota-management-error';feedback.setAttribute('role','alert');feedback.hidden=true;
    body.append(label,hint,feedback);
    const cancel=button('取消');const submit=button('确认重命名');submit.className='modal-button-primary';
    let busy=false;
    const {close}=openModal({title:`重命名「${item.title}」`,boxClass:'nota-management-box',body:[body],footer:[cancel,submit]});cancel.onclick=close;
    submit.onclick=() => void (async() => {
      if(busy) return;
      const title=input.value.trim();
      if(!title || title.length > 120) {feedback.textContent='请填写 1–120 个字的曲谱库名称。';feedback.hidden=false;input.focus();return;}
      if(session.current?.id !== item.id) {feedback.textContent='当前曲谱已切换，请关闭后重新打开操作。';feedback.hidden=false;return;}
      busy=true;input.disabled=true;submit.disabled=cancel.disabled=true;submit.textContent='正在重命名…';feedback.hidden=true;
      try {
        const renamed=await renameLibraryScore(item,title);
        // A newer save or another song must not be replaced by a delayed metadata response.
        if(session.current?.id === item.id && session.current.revision === item.revision) session.updateIdentity(renamed);
        await refreshLibrary();detail.refresh();app.setStatus(`曲谱库名称已改为「${renamed.title}」；谱面标题未改动。`);close();
      } catch(error) {feedback.textContent=failure(error);feedback.hidden=false;}
      finally {busy=false;input.disabled=false;submit.disabled=cancel.disabled=false;submit.textContent='确认重命名';}
    })();
    input.onkeydown=event => {if(event.key === 'Enter') {event.preventDefault();submit.click();}};
    input.select();
  }
  async function openDelete(selected:LibraryItem) {
    if(session.current?.id !== selected.id) return;
    if(!(await app.confirmReplace())) return;
    const item=session.current;
    if(!item || item.id !== selected.id) return;
    const protectedDraft=session.capture();
    const body=document.createElement('div');body.className='nota-management-body';
    const explanation=document.createElement('p');explanation.textContent=`从当前 Nota 服务的共享曲谱库中删除「${item.title}」？连接同一服务的家人也将无法再打开它。此操作不能撤销。${session.dirty ? '当前未保存的修改也会放弃。' : ''}`;
    const feedback=document.createElement('p');feedback.className='nota-management-error';feedback.setAttribute('role','alert');feedback.hidden=true;body.append(explanation,feedback);
    const cancel=button('取消');const remove=button('从库中删除');remove.className='nota-management-delete';
    let busy=false;
    const {close}=openModal({title:`删除「${item.title}」`,boxClass:'nota-management-box',body:[body],footer:[cancel,remove]});cancel.onclick=close;
    remove.onclick=() => void (async() => {
      if(busy) return;
      if(session.current?.id !== item.id || !session.matches(protectedDraft)) {feedback.textContent='当前稿刚刚有新修改，请关闭后重新确认删除。';feedback.hidden=false;return;}
      busy=true;remove.disabled=cancel.disabled=true;remove.textContent='正在删除…';feedback.hidden=true;
      try {
        await deleteLibraryScore(item);
        const outcome=session.forgetDeleted(item.id,protectedDraft);
        close();await refreshLibrary();
        if(outcome !== 'other-document') detail.home(true);
        const message=outcome === 'kept-draft' ? `已从曲谱库删除「${item.title}」。请求期间的新修改保留为未入库稿。` : `已从共享曲谱库删除「${item.title}」。`;
        app.setStatus(message);
        const feedback=document.getElementById('start-feedback');if(feedback) {feedback.textContent=message;feedback.hidden=false;}
      } catch(error) {feedback.textContent=failure(error);feedback.hidden=false;}
      finally {busy=false;remove.disabled=cancel.disabled=false;remove.textContent='从库中删除';}
    })();
  }
  more.onclick=() => {
    const item=session.current;
    const body=document.createElement('div');body.className='nota-management-menu';
    const rename=button('重命名');const remove=button('从库中删除');remove.className='nota-management-delete';
    rename.disabled=remove.disabled=!item;
    body.append(rename,remove);
    if(!item) {const hint=document.createElement('p');hint.textContent='这份当前稿尚未入库，请先保存入库。';body.append(hint);}
    const cancel=button('关闭');more.setAttribute('aria-expanded','true');
    const {close}=openModal({title:`管理「${session.title}」`,boxClass:'nota-management-box',body:[body],footer:[cancel],onClose:() => more.setAttribute('aria-expanded','false')});
    cancel.onclick=close;
    rename.onclick=() => {close();if(item) openRename(item);};
    remove.onclick=() => {close();if(item) void openDelete(item);};
  };
}
