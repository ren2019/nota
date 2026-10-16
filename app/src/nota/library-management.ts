import { t } from '../i18n';
import type { App } from '../editor/app';
import type { DocumentDetail } from './detail';
import { CurrentDocumentSession, LibraryError, renameLibraryScore, deleteLibraryScore, type LibraryItem } from './document-session';
import { openModal } from '../editor/dialogs';
import './library-management.css';

const button=(label:string,run?:() => void) => {const el=document.createElement('button');el.type='button';el.textContent=label;if(run) el.onclick=run;return el;};
function failure(error:unknown):string {
  const message=error instanceof Error ? error.message : String(error);
  return error instanceof LibraryError && (error.status === 409 || error.status === 404) ? t('nota.ia.managementFailure',{message}) : message;
}
/** Metadata operations never submit App.getText(); all write/delete responses are revision checked. */
interface LibraryMetadataCache {refresh():Promise<void>;applyMetadata(item:LibraryItem):void;removeItem(id:string):void}
export function mountLibraryManagement(app:App,session:CurrentDocumentSession,detail:DocumentDetail,library:LibraryMetadataCache):void {
  const more=button('⋯');more.id='nota-library-more';more.setAttribute('aria-label',t("nota.ia.moreScoreActions"));more.setAttribute('data-i18n-aria','nota.ia.moreScoreActions');more.setAttribute('aria-haspopup','dialog');more.setAttribute('aria-expanded','false');
  detail.actionSlot.append(more);
  function openRename(item:LibraryItem) {
    const body=document.createElement('div');body.className='nota-management-body';
    const label=document.createElement('label');label.textContent=t("nota.ia.libraryName");
    const input=document.createElement('input');input.type='text';input.value=item.title;input.maxLength=120;input.required=true;input.setAttribute('aria-label',t("nota.ia.libraryName"));label.append(input);
    const hint=document.createElement('p');hint.textContent=t("nota.ia.onlyTheLibraryNameChanges");
    const feedback=document.createElement('p');feedback.className='nota-management-error';feedback.setAttribute('role','alert');feedback.hidden=true;
    body.append(label,hint,feedback);
    const cancel=button(t("nota.ia.cancel"));const submit=button(t("nota.ia.confirmRename"));submit.className='modal-button-primary';
    let busy=false;
    const {close}=openModal({title:t('nota.ia.renameTitle',{title:item.title}),boxClass:'nota-management-box',body:[body],footer:[cancel,submit]});cancel.onclick=close;
    submit.onclick=() => void (async() => {
      if(busy) return;
      const title=input.value.trim();
      if(!title || title.length > 120) {feedback.textContent=t("nota.ia.enterALibraryNameOf");feedback.hidden=false;input.focus();return;}
      if(session.current?.id !== item.id) {feedback.textContent=t("nota.ia.theCurrentScoreChangedClose");feedback.hidden=false;return;}
      busy=true;input.disabled=true;submit.disabled=cancel.disabled=true;submit.textContent=t("nota.ia.renaming");feedback.hidden=true;
      try {
        const renamed=await renameLibraryScore(item,title);
        // A newer save or another song must not be replaced by a delayed metadata response.
        if(session.current?.id === item.id && session.current.revision === item.revision) session.updateIdentity(renamed);
        library.applyMetadata(renamed);void library.refresh();detail.refresh();app.setStatus(t('nota.ia.renameSuccess',{title:renamed.title}));close();
      } catch(error) {feedback.textContent=failure(error);feedback.hidden=false;}
      finally {busy=false;input.disabled=false;submit.disabled=cancel.disabled=false;submit.textContent=t("nota.ia.confirmRename");}
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
    const explanation=document.createElement('p');explanation.textContent=t('nota.ia.deleteExplanation',{title:item.title,discard:session.dirty ? t('nota.ia.deleteDiscard') : ''});
    const feedback=document.createElement('p');feedback.className='nota-management-error';feedback.setAttribute('role','alert');feedback.hidden=true;body.append(explanation,feedback);
    const cancel=button(t("nota.ia.cancel"));const remove=button(t("nota.ia.deleteFromLibrary"));remove.className='nota-management-delete';
    let busy=false;
    const {close}=openModal({title:t('nota.ia.deleteTitle',{title:item.title}),boxClass:'nota-management-box',body:[body],footer:[cancel,remove]});cancel.onclick=close;
    remove.onclick=() => void (async() => {
      if(busy) return;
      if(session.current?.id !== item.id || !session.matches(protectedDraft)) {feedback.textContent=t("nota.ia.theDraftHasNewChanges");feedback.hidden=false;return;}
      busy=true;remove.disabled=cancel.disabled=true;remove.textContent=t("nota.ia.deleting");feedback.hidden=true;
      try {
        await deleteLibraryScore(item);
        const outcome=session.forgetDeleted(item.id,protectedDraft);
        library.removeItem(item.id);close();
        if(outcome !== 'other-document') detail.home(true);
        void library.refresh();
        const message=outcome === 'kept-draft' ? t('nota.ia.deleteKeptDraft',{title:item.title}) : t('nota.ia.deleteSuccess',{title:item.title});
        app.setStatus(message);
        const feedback=document.getElementById('start-feedback');if(feedback) {feedback.textContent=message;feedback.hidden=false;}
      } catch(error) {feedback.textContent=failure(error);feedback.hidden=false;}
      finally {busy=false;remove.disabled=cancel.disabled=false;remove.textContent=t("nota.ia.deleteFromLibrary");}
    })();
  }
  more.onclick=() => {
    const item=session.current;
    const body=document.createElement('div');body.className='nota-management-menu';
    const rename=button(t("nota.ia.rename"));const remove=button(t("nota.ia.deleteFromLibrary"));remove.className='nota-management-delete';
    rename.disabled=remove.disabled=!item;
    body.append(rename,remove);
    if(!item) {const hint=document.createElement('p');hint.textContent=t("nota.ia.thisDraftIsNotIn");body.append(hint);}
    const cancel=button(t("nota.ia.close"));more.setAttribute('aria-expanded','true');
    const {close}=openModal({title:t('nota.ia.manageTitle',{title:session.title}),boxClass:'nota-management-box',body:[body],footer:[cancel],onClose:() => more.setAttribute('aria-expanded','false')});
    cancel.onclick=close;
    rename.onclick=() => {close();if(item) openRename(item);};
    remove.onclick=() => {close();if(item) void openDelete(item);};
  };
}
