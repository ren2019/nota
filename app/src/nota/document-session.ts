import { t } from '../i18n';
import type { App, ViewMode, DocumentLayoutState } from '../editor/app';
import type { DocFormatId } from '../editor/formats';
import { packProject, unpackProject } from '../editor/omrproject';
import type { SourceProvenance } from './source-import';
import { provenanceFooterSource } from './score-footer-source';

export interface LibraryItem {
  id: string; title: string; format: DocFormatId; key: string; meter: string;
  updatedAt: string; revision: number; source?: SourceProvenance;
}
/** Serialized songs/drafts carry layout, never browser-wide Nota output preferences. Legacy fields are ignored on restore. */
type RecordRenderState=Omit<DocumentLayoutState,'jianpuAccidentals' | 'practiceFontSize'> & Partial<Pick<DocumentLayoutState,'jianpuAccidentals' | 'practiceFontSize'>>;
export function documentRenderState(value:RecordRenderState):Omit<RecordRenderState,'jianpuAccidentals' | 'practiceFontSize'> {
  const {jianpuAccidentals:_accidentals,practiceFontSize:_preset,...layout}=value;
  return layout;
}
export interface LibraryPresentation {
  mode: ViewMode; noteSize: number; paper: string;
  orientation: 'portrait' | 'landscape'; margin: number[] | null;
  render?: RecordRenderState;
}
export interface LibraryScore extends LibraryItem {
  text: string; project?: string; presentation?: LibraryPresentation;
}
export class LibraryError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export async function libraryRequest<T>(path = '', options?: RequestInit, endpoint = '/api/library'): Promise<T> {
  let response: Response;
  try { response = await fetch(`${endpoint}${path}`, options); }
  catch { throw new Error(t("nota.ia.cannotConnectToTheLibrary")); }
  const body = await response.json().catch(() => null);
  if (!response.ok || body === null) throw new LibraryError(body?.error ?? t("nota.ia.theLibraryIsTemporarilyUnavailable"), response.status);
  return body as T;
}
export type LibrarySubmission = Omit<LibraryScore, 'id' | 'revision' | 'updatedAt'>;
export function writeLibraryScore(payload: LibrarySubmission, existing: LibraryItem | null, endpoint?:string):Promise<LibraryItem> {
  return libraryRequest<LibraryItem>(existing ? `/${encodeURIComponent(existing.id)}` : '', {
    method:existing ? 'PUT' : 'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...payload,...(existing ? {revision:existing.revision} : {})}),
  },endpoint);
}
/** Rename from the committed record, never from the editor's potentially dirty text/project. */
export async function renameLibraryScore(existing:LibraryItem,title:string,endpoint?:string):Promise<LibraryItem> {
  const committed=await libraryRequest<LibraryScore>(`/${encodeURIComponent(existing.id)}`,undefined,endpoint);
  return writeLibraryScore({...committed,title},existing,endpoint);
}
export function deleteLibraryScore(existing:LibraryItem,endpoint?:string):Promise<{id:string;revision:number;deleted:true}> {
  return libraryRequest(`/${encodeURIComponent(existing.id)}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:existing.revision})},endpoint);
}
export interface LibraryDraftContext {
  version:1; current:LibraryItem | null; title:string; source?:SourceProvenance;
  presentation:LibraryPresentation; baseline:string | null;
}
export interface DocumentSnapshot {
  generation:number; fingerprint:string; text:string; format:DocFormatId;
  project?:Uint8Array; presentation:LibraryPresentation; source?:SourceProvenance;
}
export type LibrarySaveResult = {status:'saved';item:LibraryItem} | {status:'changed';item:LibraryItem} | {status:'cancelled' | 'failed'};
const bytesCache=new WeakMap<Uint8Array,string>();
export function bytesBase64(bytes:Uint8Array):string {
  let encoded=bytesCache.get(bytes);
  if(encoded !== undefined) return encoded;
  const chunks:string[]=[];
  for(let i=0;i<bytes.length;i+=32768) chunks.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
  encoded=btoa(chunks.join('')); bytesCache.set(bytes,encoded); return encoded;
}
function sourceIdentity(source?:SourceProvenance):unknown {
  if(!source) return null;
  return Object.fromEntries(['url','license','sha256','importedAt','validation','method','scope','part','importedTextHash'].map(key => [key,String(source[key as keyof SourceProvenance] ?? '').slice(0,2048)]));
}
// Original input and binary buffers are immutable in the OMR controller: rotation/crop/recognition replace them.
// Compare logical snapshots, never ZIP bytes (ZIP headers include wall-clock timestamps).
function fingerprint(value:unknown):string {
  return JSON.stringify(value,(_key,entry:unknown) => entry instanceof Uint8Array ? bytesBase64(entry) : entry instanceof Map ? {__map:[...entry]} : entry);
}
/** Read and validate before touching App: an invalid record must never reveal an old score as success. */
export async function readLibraryScore(id: string, endpoint?: string, canAdopt:() => boolean = () => true): Promise<{ score: LibraryScore; project?: Uint8Array }> {
  const score = await libraryRequest<LibraryScore>(`/${encodeURIComponent(id)}`, undefined, endpoint);
  if (score.id !== id || typeof score.text !== 'string' || !score.text.trim()) throw new Error(t("nota.ia.thisLibraryRecordIsIncomplete"));
  let project: Uint8Array | undefined;
  if (score.project) {
    try {
      project = Uint8Array.from(atob(score.project), c => c.charCodeAt(0));
      const snapshot = unpackProject(project);
      // Legacy imports prepended source comments to the library text after packing the project.
      // Accept only that non-musical prefix; note edits, layout directives and format changes still fail.
      const prefix=score.text.endsWith(snapshot.text) ? score.text.slice(0,score.text.length-snapshot.text.length) : '';
      const sourceComment=score.format === '123' && snapshot.text.trim() !== '' && /^(?:%(?!%)[^\r\n]*\r?\n|[ \t]*\r?\n)+$/.test(prefix);
      if ((snapshot.text !== score.text && !sourceComment) || snapshot.docFormat !== score.format) throw new Error(t("nota.ia.projectAndScoreTextDo"));
    } catch { throw new Error(t("nota.ia.theOriginalImageProjectCannot")); }
  }
  if(!canAdopt()) throw new Error(t("nota.ia.theDraftChangedWhileWaiting"));
  return {score, project};
}

/** Only identity/baseline live here. Text, models, original images and undo history remain in the one real App. */
export class CurrentDocumentSession {
  current: LibraryItem | null = null;
  source: SourceProvenance | undefined;
  importedTitle: string | undefined;
  private baseline: string | null = null;
  private generation=0;
  private active=false;
  recovered=false;
  loading=false;
  private listeners = new Set<() => void>();
  constructor(readonly app: App) {}
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  notify(): void { this.listeners.forEach(listener => listener()); }
  get title(): string { return this.current?.title || this.importedTitle || this.app.documentTitle() || t("nota.ia.untitledScore"); }
  presentation(): LibraryPresentation {
    const page = this.app.paperState('jianpu').page;
    return {mode:this.app.viewMode, noteSize:this.app.fontSize, paper:page.paper ?? 'A4', orientation:page.orientation ?? 'portrait', margin:Array.isArray(page.margin) ? page.margin : null,render:documentRenderState(this.app.captureLayoutState())};
  }
  private fingerprint(): string {
    const project=this.app.omr.snapshot();
    const content=project ? {kind:project.kind,docFormat:project.docFormat,text:project.text,emitted:project.emitted,sources:project.sources,jianpu:project.jianpu} : null;
    return fingerprint([this.app.docFormat,this.app.getText(),content,this.presentation(),sourceIdentity(this.source)]);
  }
  get dirty(): boolean { return this.active && (this.baseline === null || this.fingerprint() !== this.baseline); }
  capture():DocumentSnapshot {
    const snapshot=this.app.omr.snapshot();
    return {generation:this.generation,fingerprint:this.fingerprint(),text:this.app.getText(),format:this.app.docFormat,
      ...(snapshot ? {project:packProject(snapshot,__APP_VERSION__)} : {}), presentation:this.presentation(),
      ...(this.source ? {source:structuredClone(this.source)} : {}),
    };
  }
  matches(snapshot:DocumentSnapshot):boolean { return snapshot.generation === this.generation && snapshot.fingerprint === this.fingerprint(); }
  /** A response may advance the server revision while newer local edits remain dirty. */
  acceptSaved(item:LibraryItem, snapshot?:DocumentSnapshot):boolean {
    if(snapshot && snapshot.generation !== this.generation) return false;
    this.current=item; this.source=item.source; this.importedTitle=undefined; this.active=true;
    this.baseline=snapshot?.fingerprint ?? this.fingerprint();
    const unchanged=!snapshot || snapshot.fingerprint === this.fingerprint();
    this.recovered=false; this.notify(); return unchanged;
  }
  /** Metadata-only operations such as rename must not clear the content save baseline. */
  updateIdentity(item:LibraryItem):void { this.current=item; this.notify(); this.app.files._scheduleDraft(); }
  /** A deleted server record must not survive as an autosave identity or a still-open committed song. */
  forgetDeleted(id:string,submitted:DocumentSnapshot):'cleared' | 'kept-draft' | 'other-document' {
    if(this.current?.id !== id) return 'other-document';
    if(!this.matches(submitted)) {
      this.detach(this.source,this.title);
      return 'kept-draft';
    }
    const releaseDraft=this.app.suspendDraftWrites();
    try {
      this.generation++;this.active=false;this.recovered=false;this.current=null;
      this.source=undefined;this.importedTitle=undefined;this.baseline=null;
      this.app.playback.stop();this.app.omr.clear();this.app.adoptText('123','',null);this.app.formats.use(null);
      this.app.exportSourceDescription='';this.app.markClean();this.notify();
      return 'cleared';
    } finally {releaseDraft();this.app.markClean();}
  }
  detach(source?:SourceProvenance,title?:string):void {
    this.generation++; this.active=true; this.recovered=false;
    this.current=null; this.source=source; this.importedTitle=title; this.baseline=null;
    this.app.exportSourceDescription=provenanceFooterSource(source); this.notify(); this.app.files._scheduleDraft();
  }
  draftContext():LibraryDraftContext | undefined {
    return this.active ? {version:1,current:this.current,title:this.title,source:this.source,presentation:this.presentation(),baseline:this.baseline} : undefined;
  }
  async restoreDraft(context:LibraryDraftContext | undefined):Promise<void> {
    this.generation++; this.active=true; this.recovered=true;
    const valid=context?.version === 1 ? context : undefined;
    const item=valid?.current;
    this.current=item && typeof item.id === 'string' && typeof item.title === 'string' && Number.isFinite(item.revision) ? item : null;
    this.source=valid?.source; this.importedTitle=typeof valid?.title === 'string' ? valid.title : undefined;
    this.baseline=typeof valid?.baseline === 'string' ? valid.baseline : null;
    const p=valid?.presentation;
    if(p && ['original','expanded','staff','mixed'].includes(p.mode)) {
      await this.app.setViewMode(p.mode);
      if(p.render) this.app.restoreLayoutState(documentRenderState(p.render));
      else if(Number.isFinite(p.noteSize) && p.noteSize >= 8 && p.noteSize <= 72) this.app.applyRenderSettings({fontSize:p.noteSize,paper:{jianpu:{paper:p.paper,orientation:p.orientation,margin:p.margin}}});
      await this.app.whenIdle();
    }
    this.app.exportSourceDescription=provenanceFooterSource(this.source);
    this.notify(); this.app.files._scheduleDraft();
  }
  async openLibrary(id: string): Promise<void> {
    if(this.loading) throw new Error(t("nota.ia.openingAScorePleaseWait"));
    this.loading=true;
    let releaseDraft=() => {};
    try {
    const before=this.capture();
    const {score, project} = await readLibraryScore(id,undefined,() => this.matches(before));
    releaseDraft=this.app.suspendDraftWrites();
    this.generation++;
    const opened=await this.app.runInputTransaction(async () => {
    this.app.playback.stop();
    if (project) {
      if (!(await this.app.openProject(project, `${score.title}.dolce`))) throw new Error(t("nota.ia.theOriginalImageProjectCannot114"));
      // Apply a legacy source prefix as an insertion after restoring the original mapping.
      // replaceText migrates OMR selection ranges; replacing the entire document would discard them.
      this.app.replaceText(score.text);
    } else {
      this.app.omr.clear(); this.app.adoptText(score.format, score.text, null); this.app.formats.use(null);
    }
    await this.app.loadBookSheet();
    const p = score.presentation;
    if (p && ['original','expanded','staff','mixed'].includes(p.mode)) {
      await this.app.setViewMode(p.mode);
      if (p.render) this.app.restoreLayoutState(documentRenderState(p.render));
      else if (Number.isFinite(p.noteSize) && p.noteSize >= 8 && p.noteSize <= 72) this.app.applyRenderSettings({fontSize:p.noteSize, paper:{jianpu:{paper:p.paper,orientation:p.orientation === 'landscape' ? 'landscape' : 'portrait',margin:p.margin}}});
    }
    await this.app.whenIdle();
    if (!this.app.scoreDoc()?.songs.length) throw new Error(t("nota.ia.thisScoreCannotBeLaid"));
      return true;
    });
    if(!opened) throw new Error(this.app.status || t("nota.ia.thisScoreCouldNotBe"));
    this.active=true; this.recovered=false;
    this.source = score.source; this.importedTitle = undefined;
    this.app.exportSourceDescription = provenanceFooterSource(score.source);
    this.acceptSaved(score); this.app.markClean();
    this.app.setStatus(t('nota.ia.libraryOpened',{title:score.title}));
    } finally {this.loading=false; releaseDraft();}
  }
}
