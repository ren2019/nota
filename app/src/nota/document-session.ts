import type { App, ViewMode } from '../editor/app';
import type { DocFormatId } from '../editor/formats';
import { unpackProject } from '../editor/omrproject';
import type { SourceProvenance } from './source-import';
import { provenanceFooterSource } from './score-footer-source';

export interface LibraryItem {
  id: string; title: string; format: DocFormatId; key: string; meter: string;
  updatedAt: string; revision: number; source?: SourceProvenance;
}
export interface LibraryPresentation {
  mode: ViewMode; noteSize: number; paper: string;
  orientation: 'portrait' | 'landscape'; margin: number[] | null;
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
  catch { throw new Error('暂时连接不到曲谱库，请确认 Nota 服务正在运行。'); }
  const body = await response.json().catch(() => null);
  if (!response.ok || body === null) throw new LibraryError(body?.error ?? '曲谱库暂时不可用，请稍后重试。', response.status);
  return body as T;
}
/** Read and validate before touching App: an invalid record must never reveal an old score as success. */
export async function readLibraryScore(id: string, endpoint?: string): Promise<{ score: LibraryScore; project?: Uint8Array }> {
  const score = await libraryRequest<LibraryScore>(`/${encodeURIComponent(id)}`, undefined, endpoint);
  if (score.id !== id || typeof score.text !== 'string' || !score.text.trim()) throw new Error('这份曲谱记录不完整，请返回曲谱库重新打开。');
  let project: Uint8Array | undefined;
  if (score.project) {
    try {
      project = Uint8Array.from(atob(score.project), c => c.charCodeAt(0));
      const snapshot = unpackProject(project);
      if (snapshot.text !== score.text || snapshot.docFormat !== score.format) throw new Error('项目与正文不一致');
    } catch { throw new Error('这份曲谱的原图项目暂时无法恢复，请返回曲谱库。'); }
  }
  return {score, project};
}

/** Only identity/baseline live here. Text, models, original images and undo history remain in the one real App. */
export class CurrentDocumentSession {
  current: LibraryItem | null = null;
  source: SourceProvenance | undefined;
  importedTitle: string | undefined;
  private baseline: string | null = null;
  private listeners = new Set<() => void>();
  constructor(readonly app: App) {}
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  notify(): void { this.listeners.forEach(listener => listener()); }
  get title(): string { return this.current?.title ?? this.importedTitle ?? this.app.documentTitle() ?? '未命名曲谱'; }
  presentation(): LibraryPresentation {
    const page = this.app.paperState('jianpu').page;
    return {mode:this.app.viewMode, noteSize:this.app.fontSize, paper:page.paper ?? 'A4', orientation:page.orientation ?? 'portrait', margin:Array.isArray(page.margin) ? page.margin : null};
  }
  private fingerprint(): string { return JSON.stringify([this.app.docFormat, this.app.getText(), this.presentation()]); }
  get dirty(): boolean { return this.baseline === null || this.fingerprint() !== this.baseline; }
  /** Kept separate from FileSession.markClean: downloading a file does not save into the shared library. */
  acceptSaved(item: LibraryItem): void { this.current = item; this.baseline = this.fingerprint(); this.notify(); }
  detach(source?: SourceProvenance, title?: string): void {
    this.current = null; this.source = source; this.importedTitle = title; this.baseline = null;
    this.app.exportSourceDescription = provenanceFooterSource(source); this.notify();
  }
  async openLibrary(id: string): Promise<void> {
    const {score, project} = await readLibraryScore(id);
    this.app.playback.stop();
    if (project) {
      if (!(await this.app.openProject(project, `${score.title}.dolce`))) throw new Error('这份曲谱的原图项目暂时无法打开。');
    } else {
      this.app.omr.clear(); this.app.adoptText(score.format, score.text, null); this.app.formats.use(null);
    }
    const p = score.presentation;
    if (p && ['original','expanded','staff','mixed'].includes(p.mode)) {
      await this.app.setViewMode(p.mode);
      if (Number.isFinite(p.noteSize) && p.noteSize >= 8 && p.noteSize <= 72) this.app.applyRenderSettings({fontSize:p.noteSize, paper:{jianpu:{paper:p.paper,orientation:p.orientation === 'landscape' ? 'landscape' : 'portrait',margin:p.margin}}});
    }
    await this.app.whenIdle();
    if (!this.app.scoreDoc()?.songs.length) throw new Error('这份曲谱暂时无法排版，请返回曲谱库检查原文件。');
    this.source = score.source; this.importedTitle = undefined;
    this.app.exportSourceDescription = provenanceFooterSource(score.source);
    this.app.markClean(); this.acceptSaved(score);
    this.app.setStatus(`已从曲谱库打开「${score.title}」。`);
  }
}
