// Actual Nota UI and engines; isolated HTTP library; only external transports are controlled.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "vite";
import { chromium } from "playwright";
import sharp from "sharp";
import { unzipSync } from "fflate";
const root = fileURLToPath(new URL("../..", import.meta.url));
const temporary = await mkdtemp(`${tmpdir()}/nota-journeys-`);
const evidence = `${root}/local/qa/spec9-journeys`;
await mkdir(evidence, { recursive: true });
process.env.NOTA_LIBRARY_DIRECTORY = temporary;
const server = await createServer({ root: `${root}/app`, configFile: `${root}/app/vite.config.ts`, server: { host: "127.0.0.1", port: 5192, strictPort: true, hmr: false } });
await server.listen();
const base = "http://127.0.0.1:5192";
const browser = await chromium.launch({ headless: true });
const results = [];
function deferred() {
  let resolve;
  const promise=new Promise(done => {resolve=done;});
  return {promise,resolve};
}
const pauseResponse=()=>({arrived:deferred(),hold:deferred()});
const score = (title = "印刷标题", notes = "1 2 3 4") => `X:1
T:${title}
M:4/4
Q:1/4=88
K:1=bE
${notes} | 5 6 7 1' |]
w:一二三四五六七八
`;
async function api(path = "", method = "GET", payload) {
  const r = await fetch(`${base}/api/library${path}`, { method, headers: { "Content-Type": "application/json" }, ...payload ? { body: JSON.stringify(payload) } : {} });
  const body = await r.json();
  return { status: r.status, body };
}
async function seed(title, text = score()) {
  const item = (await api("", "POST", { title, text, format: "123", key: "1=Eb", meter: "4/4" })).body;
  return (await api(`/${item.id}`)).body;
}
async function opened(page, item) {
  await page.goto(`${base}/?lang=zh`);
  await page.getByRole("button", { name: `打开 ${item.title}`, exact: true }).click();
  await page.locator("#nota-document-title").getByText(item.title, { exact: true }).waitFor();
}
async function mode(page, expected) {
  await page.waitForFunction((value) => document.getElementById("app")?.dataset.notaMode === value, expected);
}
async function editor(page) {
  await page.locator('[data-mode="edit"]').click();
  await page.locator("#nota-open-editor").click();
  await page.locator('.cm-content[contenteditable="true"]').waitFor({ state: "visible" });
}
async function edit(page, text) {
  await page.locator('.cm-content[contenteditable="true"]').fill(text);
  await page.waitForFunction((text2) => window.__app?.getText() === text2, text);
  await page.evaluate(() => window.__app.whenIdle());
}
async function doc(page) {
  return page.evaluate(() => ({ text: window.__app.getText(), dirty: window.__app.isDirty(), format: window.__app.docFormat, hasInputs: window.__app.omr.hasInputs }));
}
async function detail(page) {
  await page.locator("#nota-editor-back").click();
}
async function save(page) {
  await page.locator("#nota-detail-save").click();
}
const dialog = (page) => page.getByRole("dialog");
async function choose(page, label) {
  await dialog(page).getByRole("button", { name: label, exact: true }).click();
}
async function more(page, label) {
  await page.getByRole("button", { name: "更多曲谱操作", exact: true }).click();
  await choose(page, label);
}
async function home(page) {
  await page.locator("#nota-back").click();
}
async function test(name, work) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 850 } });
  const page = await context.newPage();
  page.setDefaultTimeout(12e3);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    if (process.env.NOTA_JOURNEY_FILTER && !name.includes(process.env.NOTA_JOURNEY_FILTER)) return;
    await work(page, context);
    assert.deepEqual(errors, [], "no uncaught browser errors");
    await page.screenshot({ path: `${evidence}/${name.replace(/[^a-z0-9]+/gi, "-").slice(0, 100)}.png` });
    results.push({ name, status: "passed" });
    console.log(`PASS ${name}`);
  } catch (e) {
    await page.screenshot({ path: `${evidence}/failure.png`, fullPage: true });
    results.push({ name, status: "failed", error: e.stack });
    console.error(`FAIL ${name}
${e.stack}`);
    throw e;
  } finally {
    await context.close();
  }
}
try {
  await test("empty library and loading failure are real visible states with a working refresh", async (page) => {
    assert.equal((await api()).body.length, 0);
    await page.route("**/api/library", (route) => route.fulfill({ status: 503, json: { error: "曲谱库加载不可用" } }));
    await page.goto(`${base}/?lang=zh`);
    await page.getByText("曲谱库加载不可用", { exact: true }).waitFor();
    assert.equal(await page.locator("#library-list button").count(), 0);
    await page.unroute("**/api/library");
    await page.locator("#library-refresh").click();
    await page.locator("#library-message").getByText(/还没有收藏的曲谱/).waitFor();
    assert.equal(await page.locator("#library-list button").count(), 0);
    assert.match(await page.locator("#library-count").textContent(), /0/);
  });
  await test("HTTP save failure preserves dirty document and editing; retry updates the same record", async (page) => {
    const item = await seed("保存失败");
    await opened(page, item);
    await editor(page);
    const changed = score("修改后的印刷标题", "7 2 3 4");
    await edit(page, changed);
    await detail(page);
    await page.route("**/api/library/*", (route) => route.request().method() === "PUT" ? route.fulfill({ status: 503, json: { error: "受控保存失败" } }) : route.continue());
    await save(page);
    await dialog(page).getByText("受控保存失败", { exact: true }).waitFor();
    await choose(page, "关闭");
    await mode(page, "edit");
    assert.equal((await doc(page)).text, changed);
    assert.equal((await doc(page)).dirty, true);
    assert.equal((await api(`/${item.id}`)).body.text, item.text);
    await page.unroute("**/api/library/*");
    await save(page);
    await mode(page, "practice");
    assert.equal((await doc(page)).dirty, false);
    assert.equal((await api(`/${item.id}`)).body.text, changed);
    assert.equal((await api(`/${item.id}`)).body.revision, 2);
  });
  await test("slow save confirms only submitted text while subsequent UI edits stay dirty", async (page) => {
    const item = await seed("慢保存");
    await opened(page, item);
    await editor(page);
    const submitted = score("已提交版本", "2 2 3 4"), newer = score("提交期间继续修改", "3 2 3 4");
    await edit(page, submitted);
    await detail(page);
    let release;
    const pending = new Promise((r) => release = r);
    let captured;
    const seen = new Promise((r) => captured = r);
    await page.route("**/api/library/*", async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      captured();
      await pending;
      await route.continue();
    });
    await save(page);
    await seen;
    await page.locator("#nota-open-editor").click();
    await edit(page, newer);
    release();
    await page.waitForFunction(() => !document.getElementById("nota-detail-save").disabled);
    assert.equal((await doc(page)).dirty, true);
    assert.equal((await doc(page)).text, newer);
    assert.equal((await api(`/${item.id}`)).body.text, submitted);
    await detail(page);
    await mode(page, "edit");
    assert.match(await page.locator("#nota-document-status").textContent(), /未保存/);
    await page.unroute("**/api/library/*");
    await save(page);
    await mode(page, "practice");
    assert.equal((await api(`/${item.id}`)).body.text, newer);
  });
  await test("409 cancellation retains local changes and remote revision; copy explicitly preserves both", async (page) => {
    const item = await seed("冲突保存");
    await opened(page, item);
    await editor(page);
    const local = score("本机改稿", "4 2 3 4");
    await edit(page, local);
    await detail(page);
    const remote = score("另一位使用者", "6 2 3 4");
    await api(`/${item.id}`, "PUT", { ...item, text: remote });
    await save(page);
    await choose(page, "取消");
    assert.equal((await doc(page)).text, local);
    assert.equal((await doc(page)).dirty, true);
    await mode(page, "edit");
    assert.equal((await api(`/${item.id}`)).body.text, remote);
    await save(page);
    await choose(page, "确定");
    await mode(page, "practice");
    const copyId = new URL(page.url()).searchParams.get("song");
    assert.notEqual(copyId, item.id);
    assert.equal((await api(`/${copyId}`)).body.text, local);
    assert.equal((await api(`/${item.id}`)).body.text, remote);
  });
  await test("replacement gate cancel, failed save, successful save and discard use the one real document", async (page) => {
    const item = await seed("替换保护");
    await opened(page, item);
    await editor(page);
    const changed = score("替换前修改", "5 2 3 4");
    await edit(page, changed);
    await detail(page);
    await home(page);
    await page.locator("#btn-start-new").click();
    await choose(page, "取消");
    assert.equal((await doc(page)).text, changed);
    await page.route("**/api/library/*", (route) => route.request().method() === "PUT" ? route.fulfill({ status: 503, json: { error: "替换前保存失败" } }) : route.continue());
    await page.locator("#btn-start-new").click();
    await choose(page, "保存后继续");
    await dialog(page).getByText("替换前保存失败", { exact: true }).waitFor();
    await choose(page, "关闭");
    assert.equal((await doc(page)).text, changed);
    assert.equal(new URL(page.url()).searchParams.get("screen"), null);
    await page.unroute("**/api/library/*");
    await page.locator("#btn-start-new").click();
    await choose(page, "保存后继续");
    await page.locator("#nota-document-title").getByText("未命名曲谱", { exact: true }).waitFor();
    assert.equal((await api(`/${item.id}`)).body.text, changed);
    assert.match((await doc(page)).text, /0 0 0 0/);
    await home(page);
    await page.locator("#btn-start-sample").click();
    await choose(page, "放弃修改后继续");
    await page.locator("#nota-document-title").getByText("小星星 · 练习谱", { exact: true }).waitFor();
    assert.match((await doc(page)).text, /1 1 5 5/);
  });
  await test("autosaved dirty library draft recovers its identity and edits, not a renamed new score", async (page) => {
    const item = await seed("自动恢复身份");
    await opened(page, item);
    await editor(page);
    const changed = score("恢复后的印刷标题", "6 2 3 4");
    await edit(page, changed);
    await detail(page);
    await page.waitForTimeout(3500);
    await page.reload();
    await dialog(page).getByText(new RegExp(item.title)).waitFor();
    await choose(page, "确定");
    await page.locator("#nota-document-status").getByText(/自动恢复稿/).waitFor();
    assert.equal(await page.locator("#nota-document-title").textContent(), item.title);
    assert.equal((await doc(page)).text, changed);
    assert.equal((await doc(page)).dirty, true);
    await save(page);
    await mode(page, "practice");
    assert.equal(new URL(page.url()).searchParams.get("song"), item.id);
    assert.equal((await api(`/${item.id}`)).body.text, changed);
  });
  await test("rename is metadata-only; cancel/failure/conflict do not submit dirty body or mask errors", async (page) => {
    const item = await seed("重命名原库名");
    await opened(page, item);
    await editor(page);
    const changed = score("本机未保存正文", "7 3 3 4");
    await edit(page, changed);
    await detail(page);
    await more(page, "重命名");
    await dialog(page).getByRole("textbox").fill("取消的名字");
    await choose(page, "取消");
    assert.equal((await api(`/${item.id}`)).body.title, item.title);
    await page.route("**/api/library/*", (route) => route.request().method() === "PUT" ? route.fulfill({ status: 503, json: { error: "重命名不可用" } }) : route.continue());
    await more(page, "重命名");
    await dialog(page).getByRole("textbox").fill("新库名");
    await choose(page, "确认重命名");
    await dialog(page).getByRole("alert").getByText("重命名不可用", { exact: true }).waitFor();
    assert.equal((await api(`/${item.id}`)).body.title, item.title);
    await choose(page, "取消");
    await page.unroute("**/api/library/*");
    await more(page, "重命名");
    await dialog(page).getByRole("textbox").fill("新库名");
    await choose(page, "确认重命名");
    await page.locator("#nota-document-title").getByText("新库名", { exact: true }).waitFor();
    const record = (await api(`/${item.id}`)).body;
    assert.equal(record.text, item.text);
    assert.equal((await doc(page)).text, changed);
    assert.equal((await doc(page)).dirty, true);
    await api(`/${item.id}`, "PUT", { ...record, title: "远端库名" });
    await more(page, "重命名");
    await dialog(page).getByRole("textbox").fill("不能覆盖远端");
    await choose(page, "确认重命名");
    await dialog(page).getByRole("alert").getByText(/其他人/).waitFor();
    assert.equal((await api(`/${item.id}`)).body.title, "远端库名");
    assert.equal((await doc(page)).text, changed);
    await choose(page, "取消");
  });
  await test("delete cancel/failure/conflict keep the score; confirmed success updates count and survives back/reload", async (page) => {
    const item = await seed("删除测试");
    await opened(page, item);
    const count = (await api()).body.length;
    await more(page, "从库中删除");
    await choose(page, "取消");
    assert.equal((await api(`/${item.id}`)).status, 200);
    await page.route("**/api/library/*", (route) => route.request().method() === "DELETE" ? route.fulfill({ status: 503, json: { error: "删除不可用" } }) : route.continue());
    await more(page, "从库中删除");
    await choose(page, "从库中删除");
    await dialog(page).getByRole("alert").getByText("删除不可用", { exact: true }).waitFor();
    assert.equal((await api(`/${item.id}`)).status, 200);
    await choose(page, "取消");
    await page.unroute("**/api/library/*");
    await api(`/${item.id}`, "PUT", { ...item, title: "其他人更新" });
    await more(page, "从库中删除");
    await choose(page, "从库中删除");
    await dialog(page).getByRole("alert").getByText(/其他人/).waitFor();
    assert.equal((await api(`/${item.id}`)).status, 200);
    await choose(page, "取消");
    await page.goto(`${base}/?lang=zh&screen=detail&song=${item.id}`);
    await page.locator("#nota-document-title").getByText("其他人更新", { exact: true }).waitFor();
    await more(page, "从库中删除");
    await choose(page, "从库中删除");
    await page.locator("#start-screen").waitFor({ state: "visible" });
    assert.equal((await api(`/${item.id}`)).status, 404);
    assert.equal((await api()).body.length, count - 1);
    assert.equal(await page.locator("#library-list button").count(), count - 1);
    assert.match(await page.locator("#library-count").textContent(), new RegExp(String(count - 1)));
    await page.goBack();
    assert.equal((await api(`/${item.id}`)).status, 404);
    await page.locator("#start-screen").waitFor({ state: "visible" });
    assert.equal(await page.getByRole("button", { name: "打开 其他人更新", exact: true }).count(), 0);
    await page.reload();
    await page.locator("#start-screen").waitFor({ state: "visible" });
    assert.equal(await dialog(page).count(), 0);
    assert.equal(await page.locator("#library-list button").count(), count - 1);
  });
  await test("remote deletion yields recoverable 404 for rename/delete without recreating a record", async (page) => {
    const item = await seed("远端删除对象");
    await opened(page, item);
    await api(`/${item.id}`, "DELETE", { revision: item.revision });
    await more(page, "重命名");
    await dialog(page).getByRole("textbox").fill("不能重建");
    await choose(page, "确认重命名");
    await dialog(page).getByRole("alert").getByText(/不存在/).waitFor();
    await choose(page, "取消");
    assert.equal((await doc(page)).text, item.text);
    await more(page, "从库中删除");
    await choose(page, "从库中删除");
    await dialog(page).getByRole("alert").getByText(/不存在/).waitFor();
    await choose(page, "取消");
    assert.equal((await api(`/${item.id}`)).status, 404);
    assert.equal((await doc(page)).text, item.text);
  });
  await test("tuning restores the real pre-conversion score and refuses stale restoration after manual edits", async (page) => {
    const item = await seed("调式还原保护");
    await opened(page, item);
    await page.locator('[data-mode="edit"]').click();
    await page.locator("#nota-detail-tune").click();
    await dialog(page).getByRole("combobox", { name: "目标基准", exact: true }).selectOption("0");
    await choose(page, "应用并预览");
    await page.waitForFunction((before) => window.__app.getText() !== before, item.text);
    const renotated = (await doc(page)).text;
    assert.match(renotated, /b3/);
    await page.locator("#nota-detail-tune").click();
    await choose(page, "还原本次转换");
    await page.waitForFunction((before) => window.__app.getText() === before, item.text);
    await page.locator("#nota-detail-tune").click();
    await dialog(page).getByRole("radio", { name: /实际移调/ }).check();
    await choose(page, "应用并预览");
    await page.waitForFunction((before) => window.__app.getText() !== before, item.text);
    const transposed = (await doc(page)).text;
    assert.match(transposed, /1 2 3 4/);
    assert.notEqual(transposed, renotated);
    await page.locator("#nota-open-editor").click();
    const manual = transposed.replace("1 2 3 4", "7 2 3 4");
    await edit(page, manual);
    await detail(page);
    await page.locator("#nota-detail-tune").click();
    assert.equal(await dialog(page).getByRole("button", { name: "还原本次转换", exact: true }).isDisabled(), true);
    await choose(page, "关闭");
    assert.equal((await doc(page)).text, manual);
  });
  const candidateText = "X:1\nT:受控来源曲\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c |]\n";
  const source = { url: "https://example.org/verified.abc", license: "CC0", sha256: "a".repeat(64), importedAt: "2026-10-16T00:00:00Z", validation: "passed", method: "controlled source fixture", scope: "单旋律", part: "旋律", importedTextHash: createHash("sha256").update(candidateText).digest("hex") };
  const candidate = { schema: "nota.score-candidate.v1", title: "受控来源曲", format: "abc", text: candidateText, notes: 8, measures: 2, sourceCompared: true, scope: "单旋律", source };
  const sourceItem = { id: "controlled", title: "受控来源曲", aliases: "", edition: "固定版本", composer: "受控作者", sourceName: "受控来源", url: source.url, license: "CC0", format: "abc" };
  await test("search keeps query and selection on return; stale query/prepare and failures cannot adopt an old candidate", async (page) => {
    const item = await seed("查谱前未保存");
    await opened(page, item);
    await editor(page);
    const original = score("查谱前改稿", "2 3 4 5");
    await edit(page, original);
    await detail(page);
    await home(page);
    let delayedSearch, delayedPrepare;
    let failPrepare = false;
    await page.route("**/api/score-sources**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/prepare")) {
        if (delayedPrepare) {
          delayedPrepare.arrived.resolve();
          await delayedPrepare.hold.promise;
        }
        return route.fulfill({ status: failPrepare ? 422 : 200, json: failPrepare ? { error: "候选校验失败" } : candidate });
      }
      const query2 = url.searchParams.get("q");
      if (query2 === "旧查询") {
        delayedSearch.arrived.resolve();
        await delayedSearch.hold.promise;
      }
      return route.fulfill({ json: query2 === "无结果" ? [] : [{ ...sourceItem, title: query2 === "旧查询" ? "旧结果" : "受控来源曲" }] });
    });
    await page.locator("#nota-find-score").click();
    assert.equal(await page.locator(".nota-source-result").count(), 0);
    assert.equal(await page.locator(".nota-source-adopt").isDisabled(), true);
    const query = page.getByRole("searchbox", { name: "曲名或作者", exact: true });
    delayedSearch = pauseResponse();
    await query.fill("旧查询");
    await query.press("Enter");
    await delayedSearch.arrived.promise;
    await query.fill("贝多芬");
    await query.press("Enter");
    await page.getByRole("button", { name: /受控来源曲 受控作者/ }).click();
    const oldSearchResponse=page.waitForResponse(response=>new URL(response.url()).searchParams.get("q")==="旧查询");
    delayedSearch.hold.resolve();
    await (await oldSearchResponse).finished();
    await page.evaluate(()=>new Promise(requestAnimationFrame));
    assert.equal(await page.getByText("旧结果", { exact: true }).count(), 0);
    await page.locator(".nota-search-back").click();
    await page.locator("#nota-find-score").click();
    assert.equal(await query.inputValue(), "贝多芬");
    assert.equal(await page.getByRole("button", { name: /受控来源曲 受控作者/ }).getAttribute("aria-pressed"), "true");
    delayedPrepare = pauseResponse();
    await page.getByRole("button", { name: "下载并校验此版本", exact: true }).click();
    await delayedPrepare.arrived.promise;
    await query.fill("无结果");
    await query.press("Enter");
    await page.locator(".nota-search-status").getByText(/没有找到/).waitFor();
    const oldPrepareResponse=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith("/prepare"));
    delayedPrepare.hold.resolve();
    await (await oldPrepareResponse).finished();
    delayedPrepare = null;
    await page.evaluate(()=>new Promise(requestAnimationFrame));
    assert.equal(await page.locator(".nota-source-adopt").isDisabled(), true);
    assert.equal((await doc(page)).text, original);
    await query.fill("肖邦");
    await query.press("Enter");
    await page.getByRole("button", { name: /受控来源曲 受控作者/ }).click();
    failPrepare = true;
    await page.getByRole("button", { name: "下载并校验此版本", exact: true }).click();
    await page.getByText("候选校验失败", { exact: true }).waitFor();
    assert.equal(await page.locator(".nota-source-adopt").isDisabled(), true);
    assert.equal((await doc(page)).text, original);
    failPrepare = false;
    await page.getByRole("button", { name: "下载并校验此版本", exact: true }).click();
    await page.locator(".nota-source-adopt:enabled").waitFor();
    await page.locator(".nota-source-adopt").click();
    await choose(page, "取消");
    assert.equal((await doc(page)).text, original);
    assert.equal(await query.inputValue(), "肖邦");
    assert.equal(await page.locator(".nota-source-adopt").isEnabled(), true);
    await page.locator(".nota-source-adopt").click();
    await choose(page, "放弃修改后继续");
    await page.locator("#nota-document-title").getByText("受控来源曲", { exact: true }).waitFor();
    assert.equal((await doc(page)).text, candidateText);
    assert.equal((await doc(page)).dirty, true);
    assert.equal((await api()).body.some((x) => x.title === "受控来源曲"), false);
    await page.screenshot({ path: `${evidence}/adopted-source.png` });
  });
  await test("file selection empty or invalid preserves the current document and can be retried", async (page) => {
    const item = await seed("文件选择旧稿");
    await opened(page, item);
    await home(page);
    const before = await doc(page);
    let picker = page.waitForEvent("filechooser");
    await page.locator("#btn-start-score").click();
    await (await picker).setFiles([]);
    assert.deepEqual(await doc(page), before);
    picker = page.waitForEvent("filechooser");
    await page.locator("#btn-start-score").click();
    await (await picker).setFiles({ name: "ordinary.txt", mimeType: "text/plain", buffer: Buffer.from("This is a note, not a score.") });
    await page.locator("#start-feedback").waitFor({ state: "visible" });
    assert.deepEqual(await doc(page), before);
    assert.equal((await api(`/${item.id}`)).body.text, item.text);
    picker = page.waitForEvent("filechooser");
    await page.locator("#btn-start-score").click();
    await (await picker).setFiles({ name: "new-file.123", mimeType: "text/plain", buffer: Buffer.from(score("文件导入新稿", "3 3 3 3")) });
    await page.locator("#nota-document-title").getByText("文件导入新稿", { exact: true }).waitFor();
    assert.match((await doc(page)).text, /3 3 3 3/);
    assert.equal((await doc(page)).dirty, true);
    assert.equal((await api(`/${item.id}`)).body.text, item.text);
  });
  await test("new image setup type, cancel and invalid decode preserve the original current document", async (page) => {
    const item = await seed("图片输入前稿件");
    await opened(page, item);
    await home(page);
    const before = await doc(page);
    const picker = page.waitForEvent("filechooser");
    await page.locator("#btn-start-image").click();
    const chooser = await picker;
    await chooser.setFiles({ name: "invalid.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
    await dialog(page).getByRole("combobox", { name: "本次识别类型", exact: true }).waitFor();
    await dialog(page).getByRole("combobox").selectOption("jianpu");
    await dialog(page).getByText(/仅识别/).waitFor();
    await choose(page, "取消");
    assert.deepEqual(await doc(page), before);
    const next = page.waitForEvent("filechooser");
    await page.locator("#btn-start-image").click();
    await (await next).setFiles({ name: "invalid.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
    await choose(page, "开始识别");
    await page.locator("#start-feedback").waitFor({ state: "visible" });
    assert.equal((await doc(page)).text, before.text);
    assert.equal((await api(`/${item.id}`)).body.text, item.text);
    assert.equal(await page.getByRole("button", { name: "重新选择图片", exact: true }).isVisible(), true);
    await page.getByRole("button", { name: `打开 ${item.title}`, exact: true }).click();
    assert.doesNotMatch(await page.locator("#nota-document-status").textContent(), /含原图|包含原图/);
  });
  await test("real app PNG input is recognized, manually corrected, saved and reopened with original bytes", async (page) => {
    const item = await seed("新图片识别旧稿");
    await opened(page, item);
    await page.locator("#nota-detail-export").click();
    const downloadEvent = page.waitForEvent("download");
    await dialog(page).getByRole("button", { name: "下载 PNG 图片", exact: true }).click();
    const download = await downloadEvent;
    const downloaded = await readFile(await download.path());
    const image = downloaded[0] === 80 && downloaded[1] === 75 ? Buffer.from(Object.values(unzipSync(downloaded)).at(-1)) : downloaded;
    await writeFile(`${evidence}/generated-source.png`, image);
    await choose(page, "关闭");
    await home(page);
    const picker = page.waitForEvent("filechooser");
    await page.locator("#btn-start-image").click();
    await (await picker).setFiles({ name: "generated-source.png", mimeType: "image/png", buffer: image });
    await dialog(page).getByRole("combobox", { name: "本次识别类型", exact: true }).selectOption("jianpu");
    await choose(page, "开始识别");
    await page.locator("#nota-detail-save").waitFor({ state: "visible", timeout: 9e4 });
    const recognized = await doc(page);
    assert.equal(recognized.format, "123");
    assert.match(recognized.text, /[0-7].*\|/);
    assert.equal(recognized.hasInputs, true);
    await writeFile(`${evidence}/recognition-observation.json`, JSON.stringify({ rawText: recognized.text, referenceText: item.text, accuracy: "not accepted; UI correction is a separate step" }, null, 2));
    await page.screenshot({ path: `${evidence}/recognized-image.png` });
    await save(page);
    await dialog(page).getByRole("textbox").fill("新图识别往返");
    await choose(page, "保存");
    await mode(page, "practice");
    const id = new URL(page.url()).searchParams.get("song");
    const committed = (await api(`/${id}`)).body;
    assert.ok(committed.project);
    assert.equal(committed.text, recognized.text);
    await page.reload();
    await page.locator("#nota-document-title").getByText("新图识别往返", { exact: true }).waitFor();
    assert.equal((await doc(page)).text, recognized.text);
    await editor(page);
    await edit(page, item.text);
    await detail(page);
    const corrected = await doc(page);
    await save(page);
    await mode(page, "practice");
    assert.equal(new URL(page.url()).searchParams.get("song"), id);
    await page.reload();
    await page.locator("#nota-document-title").getByText("新图识别往返", { exact: true }).waitFor();
    assert.equal((await doc(page)).text, corrected.text);
    assert.match(await page.locator("#nota-document-status").textContent(), /含原图/);
    const sources = await page.evaluate(() => window.__app.omr.snapshot().sources.map((s) => ({ name: s.name, bytes: Array.from(s.bytes) })));
    assert.equal(sources[0].name, "generated-source.png");
    assert.equal(createHash("sha256").update(Buffer.from(sources[0].bytes)).digest("hex"), createHash("sha256").update(image).digest("hex"));
    await home(page);
    const retry = page.waitForEvent("filechooser");
    await page.locator("#btn-start-image").click();
    await (await retry).setFiles({ name: "broken-new.png", mimeType: "image/png", buffer: Buffer.from("bad") });
    await choose(page, "开始识别");
    await page.locator("#start-feedback").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "打开 新图识别往返", exact: true }).click();
    assert.equal((await doc(page)).text, corrected.text);
    assert.match(await page.locator("#nota-document-status").textContent(), /含原图/);
    const preserved = await page.evaluate(() => window.__app.omr.snapshot().sources.map((s) => ({ name: s.name, bytes: Array.from(s.bytes) })));
    assert.deepEqual(preserved, sources);
  });
  await test("image dropped over a detail page fails visibly without replacing its current score", async (page) => {
    const item = await seed("详情拖图失败");
    await opened(page, item);
    const transfer = await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.items.add(new File(["broken"], "broken.png", { type: "image/png" }));
      return data;
    });
    await page.dispatchEvent("#body", "drop", { dataTransfer: transfer });
    await choose(page, "开始识别");
    await dialog(page).getByRole("alert").getByText(/识别失败/).waitFor();
    assert.equal((await doc(page)).text, item.text);
    const retry = page.waitForEvent("filechooser");
    await choose(page, "重新选择图片");
    await (await retry).setFiles([]);
    assert.equal(new URL(page.url()).searchParams.get("song"), item.id);
    await mode(page, "practice");
  });
  await test("valid image without recognized notes fails visibly and preserves the existing score", async (page) => {
    const item = await seed("无音符识别前稿件");
    await opened(page, item);
    await home(page);
    const image = await sharp({ create: { width: 300, height: 300, channels: 3, background: "white" } }).png().toBuffer();
    const picker = page.waitForEvent("filechooser");
    await page.locator("#btn-start-image").click();
    await (await picker).setFiles({ name: "blank.png", mimeType: "image/png", buffer: image });
    await dialog(page).getByRole("combobox", { name: "本次识别类型", exact: true }).selectOption("jianpu");
    await choose(page, "开始识别");
    await page.locator("#start-feedback").waitFor({ state: "visible", timeout: 9e4 });
    assert.match(await page.locator("#start-feedback").textContent(), /音符/);
    assert.equal((await doc(page)).text, item.text);
    assert.equal((await api(`/${item.id}`)).body.text, item.text);
    assert.equal(await page.getByRole("button", { name: "重新选择图片", exact: true }).isVisible(), true);
  });
} finally {
  await writeFile(`${evidence}/report.json`, JSON.stringify({ baseline:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),
    filter:process.env.NOTA_JOURNEY_FILTER ?? null, boundary: "real App, visible UI, real HTTP temporary library; external source transport controlled", results }, null, 2));
  await browser.close();
  await server.close();
  await rm(temporary, { recursive: true, force: true });
}
