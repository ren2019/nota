import { t } from '../i18n';
import type { SourceCandidate, SourceItem } from "./source-import";

export interface ScoreSourceTransport {
  search(query: string): Promise<SourceItem[]>;
  prepare(item: SourceItem): Promise<SourceCandidate>;
  validate(data: unknown): Promise<SourceCandidate>;
}
async function request<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api/score-sources${path}`, data === undefined ? undefined : {
    method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(data),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new Error(body?.error ?? t("nota.ia.scoreSourcesAreTemporarilyUnavailable"));
  return body;
}
export const scoreSourceTransport: ScoreSourceTransport = {
  search: query => request(`?q=${encodeURIComponent(query)}`),
  prepare: item => request("/prepare", item.id ? {id:item.id} : item),
  validate: data => request("/validate", data),
};
export type SearchPhase = "idle" | "searching" | "results" | "empty" | "error" | "preparing" | "ready" | "adopting";

/** A browsing session owns requests and selections, never the current music document.
 * Transport is the HTTP boundary; preparing cannot adopt or save a score. */
export class ScoreSearchSession {
  draft = "";
  query = "";
  items: SourceItem[] = [];
  selected: SourceItem | null = null;
  candidate: SourceCandidate | null = null;
  phase: SearchPhase = "idle";
  error = "";
  private searchVersion = 0;
  private prepareVersion = 0;
  private listeners = new Set<() => void>();
  constructor(private transport: ScoreSourceTransport = scoreSourceTransport) {}
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private notify() { this.listeners.forEach(listener => listener()); }
  get pendingQuery(): boolean { return this.draft.trim() !== this.query; }
  setDraft(value: string): void {
    if (this.phase === "adopting") return;
    if (value === this.draft) return;
    this.draft = value; this.searchVersion++; this.prepareVersion++;
    this.selected = null; this.candidate = null; this.error = "";
    this.phase = this.items.length ? "results" : "idle"; this.notify();
  }
  async submit(): Promise<void> {
    if (this.phase === "adopting") return;
    const query = this.draft.trim(); const version = ++this.searchVersion;
    this.prepareVersion++; this.query = query; this.items = []; this.selected = null; this.candidate = null; this.error = "";
    this.phase = query ? "searching" : "idle"; this.notify(); if (!query) return;
    try {
      const items = await this.transport.search(query);
      if (version !== this.searchVersion) return;
      this.items = items; this.phase = items.length ? "results" : "empty";
    } catch (e) {
      if (version !== this.searchVersion) return;
      this.error = e instanceof Error ? e.message : String(e); this.phase = "error";
    }
    this.notify();
  }
  select(item: SourceItem): void {
    if (this.phase === "adopting") return;
    if (this.pendingQuery) return;
    this.prepareVersion++; this.selected = item; this.candidate = null; this.error = ""; this.phase = "results"; this.notify();
  }
  async prepare(): Promise<void> {
    if (this.phase === "adopting") return;
    const item = this.selected; if (!item || this.pendingQuery) return;
    await this.prepareWith(() => this.transport.prepare(item));
  }
  async validateFile(file: File): Promise<void> {
    if (this.phase === "adopting") return;
    this.selected = null;
    await this.prepareWith(async () => {
      if (file.size > 32 * 1024 * 1024) throw new Error(t("nota.ia.theCandidateFileExceedsMb"));
      let data: unknown;
      try { data = JSON.parse(await file.text()); } catch { throw new Error(t("nota.ia.theFileIsNotValid")); }
      return this.transport.validate(data);
    });
  }
  private async prepareWith(work: () => Promise<SourceCandidate>): Promise<void> {
    const version = ++this.prepareVersion;
    this.candidate = null; this.error = ""; this.phase = "preparing"; this.notify();
    try {
      const candidate = await work(); if (version !== this.prepareVersion) return;
      if (candidate.schema !== "nota.score-candidate.v1" || !candidate.sourceCompared || !candidate.text?.trim() || !candidate.source?.url) throw new Error(t("nota.ia.sourceValidationDidNotPass"));
      this.candidate = candidate; this.phase = "ready";
    } catch (e) {
      if (version !== this.prepareVersion) return;
      this.error = e instanceof Error ? e.message : String(e); this.phase = "error";
    }
    this.notify();
  }
  async adopt(open: (candidate: SourceCandidate) => Promise<boolean>): Promise<boolean> {
    const candidate = this.candidate;
    if (!candidate || this.phase !== "ready") return false;
    this.phase = "adopting"; this.error = ""; this.notify();
    try { return await open(candidate); }
    catch (e) { this.error = e instanceof Error ? e.message : String(e); return false; }
    finally { this.phase = "ready"; this.notify(); }
  }
}
