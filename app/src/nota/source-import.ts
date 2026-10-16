import { openModal } from "../editor/dialogs";
export interface SourceProvenance {
  url: string;
  license: string;
  sha256: string;
  importedAt: string;
  validation: string;
  method: string;
  scope: string;
  part: string;
  importedTextHash: string;
  edited?: boolean;
}
export interface SourceCandidate {
  schema: string;
  title: string;
  text: string;
  format: "abc" | "musicxml";
  notes: number;
  measures: number;
  sourceCompared: boolean;
  scope: string;
  source: SourceProvenance;
}
interface SourceItem {
  id?: string;
  format?: "abc" | "musicxml";
  part?: number;
  title: string;
  aliases: string;
  edition: string;
  license: string;
  url: string;
}
async function api<T>(path: string, data?: unknown): Promise<T> {
  const r = await fetch(
    `/api/score-sources${path}`,
    data
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      : undefined,
  );
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? "暂时无法导入曲谱。");
  return body;
}
/** Small catalogue + agent-produced candidate files. No model/API key in the app. */
export function mountSourceImport(
  adopt: (candidate: SourceCandidate) => Promise<void>,
) {
  const launch = document.createElement("button");
  launch.type = "button";
  launch.className = "library-refresh";
  launch.textContent = "联网找谱";
  launch.id = "nota-find-score";
  document.querySelector(".library-heading")!.append(launch);
  launch.onclick = () => {
    let live = true,
      busy = false,
      candidate: SourceCandidate | null = null;
    const body = document.createElement("div");
    body.className = "source-import";
    const intro = document.createElement("p");
    intro.textContent =
      "从结构化原谱导入，保留音高与八度。先查看来源和验证结果，再打开校对；不会直接写入曲谱库。";
    const query = document.createElement("input");
    query.type = "search";
    query.placeholder = "搜索曲名，如国际歌、摇篮曲";
    query.setAttribute("aria-label", "搜索在线曲谱");
    const search = document.createElement("button");
    search.type = "button";
    search.textContent = "搜索在线谱库";
    const list = document.createElement("div");
    list.className = "source-list";
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const detail = document.createElement("div");
    detail.className = "source-detail";
    detail.hidden = true;
    const files = document.createElement("input");
    files.type = "file";
    files.accept = ".json,.nota-score.json";
    files.id = "nota-source-file";
    const label = document.createElement("label");
    label.textContent = "导入 agent 准备的候选文件";
    label.htmlFor = files.id;
    const explanation = document.createElement("small");
    explanation.textContent =
      "提供首批国歌曲谱及 OpenScore 歌曲库检索。未找到的曲子可请 agent 从其他支持来源查找，生成候选文件后在此导入。";
    body.append(
      intro,
      query,
      search,
      list,
      status,
      detail,
      label,
      files,
      explanation,
    );
    const cancel = document.createElement("button");
    cancel.textContent = "关闭";
    const open = document.createElement("button");
    open.textContent = "打开候选并校对";
    open.className = "modal-button-primary";
    open.disabled = true;
    const modal = openModal({
      title: "联网找谱",
      boxClass: "source-import-box",
      body: [body],
      footer: [cancel, open],
      onClose: () => {
        live = false;
      },
    });
    cancel.onclick = modal.close;
    open.onclick = async () => {
      if (!candidate || busy) return;
      busy = true;
      open.disabled = true;
      try {
        await adopt(candidate);
        modal.close();
      } catch (e) {
        status.textContent = e instanceof Error ? e.message : String(e);
        busy = false;
        open.disabled = false;
      }
    };
    async function prepare(path: string, data: unknown) {
      if (busy) return;
      busy = true;
      candidate = null;
      detail.hidden = true;
      open.disabled = true;
      status.textContent =
        "正在下载原谱并独立核对音高、八度、时值、起音和结构…";
      try {
        const result = await api<SourceCandidate>(path, data);
        if (!live) return;
        candidate = result;
        const title = document.createElement("strong");
        title.textContent = result.title;
        const summary = document.createElement("p");
        summary.textContent = `源数据对照通过 · ${result.measures} 小节 · ${result.notes} 个音符（含倚音）`;
        const scope = document.createElement("p");
        scope.textContent = result.scope;
        const method = document.createElement("p");
        method.textContent = `验证：${result.source.method}。与选定数字谱本一致，原谱版本仍请核对。`;
        const link = document.createElement("a");
        link.href = result.source.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "查看原始来源";
        const license = document.createElement("p");
        license.textContent = result.source.license;
        detail.replaceChildren(title, summary, scope, method, link, license);
        detail.hidden = false;
        open.disabled = false;
        status.textContent = "候选已准备；打开后仍可编辑，确认后再保存入库。";
      } catch (e) {
        if (live)
          status.textContent = e instanceof Error ? e.message : String(e);
      } finally {
        busy = false;
      }
    }
    files.onchange = async () => {
      const file = files.files?.[0];
      if (!file) return;
      try {
        if (file.size > 32 * 1024 * 1024) throw new Error("候选文件过大。");
        await prepare("/validate", JSON.parse(await file.text()));
      } catch (e) {
        status.textContent = e instanceof Error ? e.message : String(e);
      }
    };
    let items: SourceItem[] = [];
    function render() {
      list.replaceChildren();
      const q = query.value.normalize("NFKC").toLocaleLowerCase().trim();
      const shown = items.filter((i) =>
        (i.title + " " + i.aliases)
          .normalize("NFKC")
          .toLocaleLowerCase()
          .includes(q),
      );
      for (const item of shown) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "library-item";
        b.textContent = item.title + " · " + item.edition;
        b.onclick = () =>
          void prepare("/prepare", item.id ? { id: item.id } : item);
        list.append(b);
      }
      if (!shown.length) {
        const empty = document.createElement("p");
        empty.textContent =
          "没有匹配项，可换用原文曲名、作者，或导入另行找到的候选文件。";
        list.append(empty);
      }
    }
    query.oninput = render;
    async function searchOnline() {
      const q = query.value.trim();
      search.disabled = true;
      status.textContent = "正在检索 OpenScore 结构化曲谱索引…";
      try {
        const result = await api<SourceItem[]>(`?q=${encodeURIComponent(q)}`);
        if (live && query.value.trim() === q) {
          items = result.map((item) => ({
            ...item,
            aliases: item.aliases + " " + q,
          }));
          render();
          status.textContent = `找到 ${result.length} 个候选来源；请先确认曲名、版本和声部。`;
        }
      } catch (e) {
        if (live)
          status.textContent = e instanceof Error ? e.message : String(e);
      } finally {
        search.disabled = false;
      }
    }
    search.onclick = () => void searchOnline();
    query.onkeydown = (e) => {
      if (e.key === "Enter") void searchOnline();
    };
    void api<SourceItem[]>("")
      .then((data) => {
        if (live) {
          items = data;
          render();
        }
      })
      .catch((e) => {
        status.textContent = e.message;
      });
    query.focus();
  };
}
