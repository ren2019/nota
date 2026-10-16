// Real App + CodeMirror + renderer acceptance. Uses only an isolated loopback Vite
// server and temporary library; never points at a running deployment.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { unzipSync } from "fflate";
const appRoot = fileURLToPath(new URL("..", import.meta.url));
const evidence = fileURLToPath(
  new URL("../../local/qa-dolce/", import.meta.url),
);
await mkdir(evidence, { recursive: true });
const library = await mkdtemp(`${tmpdir()}/nota-editor-`);
const port = Number(process.env.NOTA_EDITOR_TEST_PORT || 5191);
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    `${appRoot}/node_modules/vite/bin/vite.js`,
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  {
    cwd: appRoot,
    env: { ...process.env, NOTA_LIBRARY_DIRECTORY: library },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let serverOutput = "";
server.stdout.on("data", (b) => {
  serverOutput += b;
});
server.stderr.on("data", (b) => {
  serverOutput += b;
});
const report = {
  kind: "isolated Chromium real-App acceptance",
  startedAt: new Date().toISOString(),
  cases: [],
  errors: [],
};
let browser;
try {
  for (let n = 0; n < 100; n++) {
    if (server.exitCode !== null) throw new Error(serverOutput);
    try {
      if (serverOutput.includes("ready in") && (await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  const text = () => page.evaluate(() => window.__app.getText());
  const score = () => page.evaluate(() => window.__app.scoreDoc());
  const wait = async (fn) => {
    for (let n = 0; n < 100; n++) {
      if (await fn()) return;
      await page.waitForTimeout(50);
    }
    throw Error("Observable output did not settle");
  };
  const record = async (name, run) => {
    if (
      process.env.NOTA_EDITOR_CASE &&
      !new RegExp(process.env.NOTA_EDITOR_CASE).test(name)
    )
      return;
    await run();
    report.cases.push({ name, status: "passed" });
    console.log(`PASS ${name}`);
  };
  const source =
    "X:1\nT:验收乐谱\nM:4/4\nL:1/4\nK:1=C\n1 2 3 4 | 5 6 7 1' |]\nw:春天好花開了\n";
  const setSource = async (s = source) => {
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText(s);
    await wait(async () => (await text()) === s);
    await page.waitForTimeout(280);
  };
  const firstNote = () =>
    page
      .locator("#score-pane svg text[font-weight=bold]")
      .filter({ hasText: /^1$/ })
      .first();
  const selectFirst = async () => {
    await firstNote().click();
    await page.waitForTimeout(30);
  };
  const pick = async (label) => {
    await page
      .locator(`#visual-palette button[title^="${label}"]`)
      .first()
      .click();
  };
  const undo = async () => {
    await pick("撤销");
  };
  await page.goto(`${base}/?lang=zh`);
  await page.locator("#btn-start-sample").click();
  await page.locator("[data-mode=edit]").click();
  await page.locator("#nota-open-editor").click();
  await page.locator("#btn-palette").click();
  await record("source edit renders the new title and notes", async () => {
    await setSource();
    assert.match(await page.locator("#score-pane").innerText(), /验收乐谱/);
    assert.equal((await score()).songs[0].parts[0].measures.length, 2);
  });
  // Each operation starts with the same independent, literal score. Undo must
  // restore the complete source, including words and layout, not just a note.
  const actions = [
    ["digit", "7", /^7 2 3 4/],
    ["rest", "0", /^0 2 3 4/],
    ["letter", "e", /^3 2 3 4/],
    ["diatonic-up", "ArrowUp", /^2 2 3 4/],
    ["diatonic-down", "ArrowDown", /^7, 2 3 4/],
    ["semitone-up", "Alt+ArrowUp", /^#1 2 3 4/],
    ["semitone-down", "Alt+ArrowDown", /^7, 2 3 4/],
    ["octave-up", "'", /^1' 2 3 4/],
    ["octave-down", ",", /^1, 2 3 4/],
    ["sharp", "#", /^#1 2 3 4/],
    ["flat", "Shift+B", /^b1 2 3 4/],
    ["halve", "_", /^1_ 2 3 4/],
    ["double", "=", /^1 - 2 3 4/],
    ["dot", ".", /^1\. 2 3 4/],
    ["sustain", "-", /^1 - 2 3 4/],
    ["fermata", "Shift+F", /!fermata!1/],
    ["accent", ">", /!accent!1/],
    ["repeat-selection", "r", /^1 ?1 2 3 4/],
    ["delete", "Delete", /^ ?2 3 4/],
  ];
  for (const [name, key, expected] of actions)
    await record(`visual keyboard ${name} and shared undo`, async () => {
      await setSource();
      await selectFirst();
      await page.keyboard.press(key);
      await wait(async () => (await text()) !== source);
      assert.match((await text()).split("\n")[5], expected);
      await undo();
      assert.equal(await text(), source);
    });
  await record(
    "palette insertion, redo and return retain one editable draft",
    async () => {
      await setSource();
      await selectFirst();
      await pick("插入模式");
      await pick("唱名 5");
      assert.match((await text()).split("\n")[5], /^1 5 2 3 4/);
      const edited = await text();
      await page.locator("#nota-editor-back").click();
      assert.match(await page.locator("#score-pane").innerText(), /验收乐谱/);
      await page.locator("#nota-open-editor").click();
      assert.equal(await text(), edited);
      await undo();
      assert.equal(await text(), source);
      await pick("重做");
      assert.equal(await text(), edited);
    },
  );
  await record(
    "source view and all four rendering modes keep editable content",
    async () => {
      await setSource();
      for (const mode of ["expanded", "original", "staff", "mixed"]) {
        await page.locator(`#btn-view-${mode}`).click();
        await wait(
          async () => (await page.locator("#score-pane svg").count()) > 0,
        );
        await page.waitForTimeout(150);
        assert.equal(await text(), source);
        assert.match(await page.locator("#score-pane").innerText(), /验收乐谱/);
        await page.screenshot({ path: `${evidence}/${mode}.png` });
      }
      await page.locator("#btn-view-original").click();
    },
  );
  await record("context menu offers note and measure editing", async () => {
    await setSource();
    await firstNote().click({ button: "right" });
    const menu = page.locator(".visual-menu");
    assert.match(await menu.innerText(), /撤销|唱名/);
    await page.keyboard.press("Escape");
  });
  for (const [label, expected] of [
    ["双小节线", /4 \|\| 5/],
    ["终止线", /4 \|\] 5/],
    ["反复开始", /\|: 1 2/],
    ["反复结束", /4 :\| 5/],
    ["第一房", /\[1/],
    ["第二房", /\[2/],
    ["D.C.", /!D.C.!/],
    ["D.S.", /!D.S.!/],
    ["Fine", /!fine!/],
  ])
    await record(`measure structure ${label}`, async () => {
      await setSource();
      await selectFirst();
      await pick(label);
      assert.match(await text(), expected);
      await undo();
      assert.equal(await text(), source);
    });
  for (const [label, count] of [
    ["追加小节", 3],
    ["前插小节", 3],
    ["删除小节", 1],
  ])
    await record(`measure count ${label}`, async () => {
      await setSource();
      await selectFirst();
      await pick(label);
      assert.equal((await score()).songs[0].parts[0].measures.length, count);
      await undo();
      assert.equal(await text(), source);
    });
  for (const [label, value, expected] of [
    ["调号…", "G", /K:1=G/],
    ["拍号…", "3/4", /M:3\/4/],
    ["速度…", "120", /Q:1\/4=120/],
    ["和弦名录入", "Am", /Am 1/],
    ["文字（", "练习提示", /练习提示/],
    ["力度（", "mf", /!mf!1/],
  ])
    await record(`inline ${label}`, async () => {
      await setSource();
      await selectFirst();
      await pick(label);
      await page.locator(".vis-inline").fill(value);
      await page.locator(".vis-inline").press("Enter");
      assert.match(await text(), expected);
      await page.keyboard.press("Escape");
      await undo();
      assert.equal(await text(), source);
    });
  await record(
    "lyric entry, chord label and double-click text are editable",
    async () => {
      await setSource();
      await selectFirst();
      await pick("歌词录入");
      await page.locator(".vis-inline").fill("新");
      await page.locator(".vis-inline").press("Enter");
      await page.keyboard.press("Escape");
      assert.match(await text(), /w:新天好花/);
      await page
        .locator("#score-pane svg text")
        .filter({ hasText: /^验收乐谱$/ })
        .dblclick();
      await page.keyboard.insertText("新标题");
      assert.match(await text(), /新标题/);
    },
  );
  for (const [name, key, noteText, expected] of [
    ["slur", "s", "1 2 3 4", /\(1 2\)/],
    ["tie", "t", "1 1 3 4", /\(1 1\)/],
    ["tuplet", "Alt+Shift+3", "1 2 3 4", /\(3: 1 2 3\)/],
  ])
    await record(`selected range ${name}`, async () => {
      const original = source.replace("1 2 3 4", noteText);
      await setSource(original);
      await selectFirst();
      if (name !== "tie") await page.keyboard.press("Shift+ArrowRight");
      if (name === "tuplet") await page.keyboard.press("Shift+ArrowRight");
      await page.keyboard.press(key);
      assert.match(await text(), expected);
      await undo();
      assert.equal(await text(), original);
    });
  await record("line and page breaks retain all lyrics and undo", async () => {
    for (const label of ["换行", "换页"]) {
      await setSource();
      await selectFirst();
      await pick(label);
      assert.notEqual(await text(), source);
      assert.match(await text(), /w: ?春/);
      assert.match(await text(), /天好花/);
      await undo();
      assert.equal(await text(), source);
    }
  });
  await record(
    "shared clipboard copy/paste/cut through browser events",
    async () => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await setSource();
      await selectFirst();
      await page.keyboard.press("ControlOrMeta+C");
      await page.keyboard.press("ControlOrMeta+V");
      assert.match((await text()).split("\n")[5], /^1 ?1 2 3 4/);
      await undo();
      assert.equal(await text(), source);
      await selectFirst();
      await page.keyboard.press("ControlOrMeta+X");
      assert.match((await text()).split("\n")[5], /^ ?2 3 4/);
      await undo();
      assert.equal(await text(), source);
    },
  );
  await record(
    "context-menu inline entry keeps focus and accepts a chord name",
    async () => {
      await setSource();
      await firstNote().click({ button: "right" });
      await page
        .locator(".visual-menu-item")
        .filter({ hasText: /^和弦名录入/ })
        .click();
      await page.locator(".vis-inline").fill("Dm");
      await page.locator(".vis-inline").press("Enter");
      assert.match(await text(), /Dm 1/);
    },
  );
  await record(
    "parts rename, duplicate, reorder, lyrics, mute, solo, volume and delete",
    async () => {
      await setSource();
      await page.locator("#btn-parts").click();
      const rows = () =>
        page.locator(".parts-table tr").filter({ has: page.locator("input") });
      await rows().first().locator(".parts-input").first().fill("旋律");
      await rows().first().locator(".parts-input").first().press("Tab");
      assert.match(await text(), /name="旋律"/);
      await rows()
        .first()
        .getByRole("button", { name: "复制", exact: true })
        .click();
      assert.equal((await score()).songs[0].parts.length, 2);
      await rows().nth(1).locator(".parts-input").first().fill("副声部");
      await rows().nth(1).locator(".parts-input").first().press("Tab");
      await rows()
        .nth(1)
        .getByRole("button", { name: "↑", exact: true })
        .click();
      assert.equal((await score()).songs[0].parts[0].name, "副声部");
      await rows().first().locator('input[title="试听时不出这个声部"]').check();
      await rows()
        .first()
        .locator('input[title="只听这个声部（练声部用）"]')
        .check();
      await rows().first().locator("input[type=range]").fill("35");
      await rows().first().locator("input[type=range]").dispatchEvent("change");
      assert.equal(
        await page.evaluate(() => __app.playback.getPartVolume(0)),
        0.35,
      );
      assert.equal(await page.evaluate(() => __app.playback.solo), 0);
      assert.equal(
        await page.evaluate(() => __app.playback.partMuted[0]),
        true,
      );
      await rows().first().locator("input[name=parts-melody]").check();
      assert.equal(await page.evaluate(() => __app.melodyPart), 0);
      await rows()
        .nth(1)
        .getByRole("button", { name: "删除", exact: true })
        .click();
      await page
        .locator(".modal-box")
        .last()
        .getByRole("button", { name: "确定", exact: true })
        .click();
      assert.equal((await score()).songs[0].parts.length, 1);
      await page.getByRole("button", { name: "新建声部", exact: true }).click();
      assert.equal((await score()).songs[0].parts.length, 2);
      await page.screenshot({ path: `${evidence}/parts.png` });
      await page.getByRole("button", { name: "完成", exact: true }).click();
    },
  );
  await record("parts copies lyrics onto another melody", async () => {
    await setSource(
      source.replace(
        "1 2 3 4 | 5 6 7 1' |]\nw:春天好花開了",
        'V:1 name="旋律"\n1 2 3 4 | 5 6 7 1\' |]\nw:春天好花開了\nV:2 name="伴唱"\n1 2 3 4 | 5 6 7 1\' |]',
      ),
    );
    await page.locator("#btn-parts").click();
    await page
      .locator(".parts-tools")
      .getByRole("button", { name: "复制歌词", exact: true })
      .click();
    assert.ok(
      (await score()).songs[0].parts[1].measures[0].elements.some(
        (e) => e.lyrics?.[0]?.text === "春",
      ),
    );
    await page.getByRole("button", { name: "完成", exact: true }).click();
  });
  await record(
    "all settings tabs, scope explanation, help topics and traditional conversion",
    async () => {
      await setSource();
      await page.locator("#btn-options").click();
      for (const tab of ["版面", "页眉与样式", "简谱输出", "其他"]) {
        await page.getByRole("tab", { name: tab, exact: true }).click();
        assert.ok(
          await page
            .getByRole("tabpanel")
            .filter({ visible: true })
            .innerText(),
        );
      }
      assert.match(
        await page.locator(".modal-box").innerText(),
        /当前.*模式|当前.*排版|浏览器/,
      );
      await page.keyboard.press("Escape");
      await page.locator("#btn-help").click();
      for (const tab of [
        "功能帮助",
        "可视化编辑",
        "123 格式",
        "JPWABC 记谱",
        "关于",
      ]) {
        await page.locator(".help-tab").getByText(tab, { exact: true }).click();
        assert.ok(
          (await page.locator(".help-content").innerText()).length > 20,
        );
      }
      await page.keyboard.press("Escape");
      await page.locator("#btn-hanzi").click();
      await page.locator(".modal-box select").selectOption("t2s");
      await page
        .locator(".modal-box")
        .getByRole("button", { name: "确定", exact: true })
        .click();
      await wait(async () => /春天好花开了/.test(await text()));
      await undo();
      assert.equal(await text(), source);
    },
  );
  const importFile = async (name, buffer) => {
    const importedContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    const p = await importedContext.newPage();
    p.setDefaultTimeout(8000);
    p.on("pageerror", (e) => report.errors.push(e.message));
    await p.goto(`${base}/?lang=zh`);
    const chooser = p.waitForEvent("filechooser");
    await p.locator("#btn-start-score").click();
    await (
      await chooser
    ).setFiles({ name, mimeType: "application/octet-stream", buffer });
    if (/\.musicxml$/.test(name)) {
      await p
        .locator(".modal-box")
        .getByRole("button", { name: "取消", exact: true })
        .click();
    }
    await p.locator("#nota-open-editor").waitFor();
    await p.locator("#nota-open-editor").click();
    await p.waitForTimeout(300);
    return p;
  };
  await record(
    "all source formats save, reopen and retain literal music",
    async () => {
      await setSource();
      for (const [label, ext] of [
        ["123（当前格式）", "123"],
        ["简谱 JPWABC", "jpwabc"],
        ["ABC", "abc"],
        ["番茄简谱", "pu"],
        ["诗歌本文本谱", "pu"],
        ["jianpu-ly 文本（.jly）", "jly"],
        ["Muse 简谱（.jcx）", "jcx"],
      ]) {
        await page.locator("#btn-saveas").click();
        const download = page.waitForEvent("download");
        await page
          .locator(".modal-box")
          .getByRole("button", { name: label, exact: true })
          .click();
        const d = await download;
        assert.ok(
          d.suggestedFilename().endsWith(ext),
          `${label}: ${d.suggestedFilename()}`,
        );
        const bytes = await readFile(await d.path());
        assert.ok(bytes.length > 20);
        await writeFile(`${evidence}/${label.split("（")[0]}.${ext}`, bytes);
        const reopened = await importFile(d.suggestedFilename(), bytes);
        const doc = await reopened.evaluate(() => __app.scoreDoc());
        assert.equal(doc.songs[0].parts[0].measures.length, 2, label);
        const notes = doc.songs[0].parts[0].measures
          .flatMap((m) => m.elements)
          .filter((e) => e.kind === "chord");
        assert.equal(notes.length, 8, label);
        assert.match(
          await reopened.locator("#score-pane").innerText(),
          /验收乐谱/,
        );
        await reopened.close();
        assert.equal(await text(), source);
      }
    },
  );
  await record(
    "lossy save requires confirmation and cancellation preserves source",
    async () => {
      await setSource(source.replace("1 2 3 4", "Am !mf!1 2 3 4"));
      const before = await text();
      await page.locator("#btn-saveas").click();
      await page
        .locator(".modal-box")
        .getByRole("button", { name: "简谱 JPWABC", exact: true })
        .click();
      assert.match(
        await page.locator(".modal-box").last().innerText(),
        /和弦|力度/,
      );
      await page
        .locator(".modal-box")
        .last()
        .getByRole("button", { name: "取消", exact: true })
        .click();
      assert.equal(await text(), before);
      await page.locator("#btn-saveas").click();
      const d = page.waitForEvent("download");
      await page
        .locator(".modal-box")
        .getByRole("button", { name: "简谱 JPWABC", exact: true })
        .click();
      await page
        .locator(".modal-box")
        .last()
        .getByRole("button", { name: "确定", exact: true })
        .click();
      assert.ok((await readFile(await (await d).path())).length > 20);
      assert.equal(await text(), before);
    },
  );
  await record(
    "MusicXML model editing, ornaments, chord notes and voice preserve real XML",
    async () => {
      const xml = `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>模型验收</work-title></work><part-list><score-part id="P1"><part-name>旋律</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${["C", "D", "E", "F"].map((step) => `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>`).join("")}</measure><measure number="2">${["G", "A", "B", "C"].map((step) => `<note><pitch><step>${step}</step><octave>${step === "C" ? 5 : 4}</octave></pitch><duration>4</duration><type>quarter</type></note>`).join("")}</measure></part></score-partwise>`;
      const p = await importFile("model.musicxml", Buffer.from(xml));
      await p.locator("#btn-view-original").click();
      await p.waitForTimeout(300);
      if (!(await p.locator("#visual-palette").isVisible()))
        await p.locator("#btn-palette").click();
      const select = () =>
        p
          .locator("#score-pane svg text[font-weight=bold]")
          .filter({ hasText: /^1$/ })
          .first()
          .click();
      const pal = (label) =>
        p.locator(`#visual-palette button[title^="${label}"]`).first();
      const first = () =>
        p.evaluate(() =>
          __app
            .scoreDoc()
            .songs[0].parts[0].measures[0].elements.find(
              (e) => e.kind === "chord",
            ),
        );
      await select();
      await p.keyboard.press("7");
      assert.equal((await first()).notes[0].pitch.step, "B");
      await pal("撤销").click();
      assert.equal((await first()).notes[0].pitch.step, "C");
      for (const [label, token] of [
        ["顿音", "staccato"],
        ["保持音", "tenuto"],
        ["强重音", "strong-accent"],
        ["短顿音", "staccatissimo"],
        ["倒延长号", "fermata"],
        ["颤音", "trill-mark"],
        ["波音", "mordent"],
        ["回音", "turn"],
        ["倚音", "grace"],
      ]) {
        await select();
        await pal(label).click();
        assert.match(
          await p.evaluate(() => __app.getText()),
          new RegExp(`<${token}[ >/]`),
          label,
        );
        await pal("撤销").click();
      }
      await select();
      await pal("加和弦音：唱名 3").click();
      assert.equal((await first()).notes.length, 2);
      await p.locator("#btn-parts").click();
      await p.getByRole("button", { name: "按和弦拆", exact: true }).click();
      assert.equal(
        await p.evaluate(() => __app.scoreDoc().songs[0].parts.length),
        2,
      );
      await p
        .getByRole("button", { name: "并入上一个", exact: true })
        .last()
        .click();
      assert.equal(
        await p.evaluate(() => __app.scoreDoc().songs[0].parts.length),
        1,
      );
      await p.getByRole("button", { name: "完成", exact: true }).click();
      await p.keyboard.press("ControlOrMeta+Z");
      await p.keyboard.press("ControlOrMeta+Z");
      await p.keyboard.press("ControlOrMeta+Z");
      assert.equal((await first()).notes.length, 1);
      for (const [label, token] of [
        ["渐强", "wedge"],
        ["渐弱", "wedge"],
        ["高八度线", "octave-shift"],
        ["低八度线", "octave-shift"],
      ]) {
        await select();
        await p.keyboard.press("Shift+ArrowRight");
        await pal(label).click();
        assert.match(
          await p.evaluate(() => __app.getText()),
          new RegExp(`<${token}[ >/]`),
          label,
        );
        await pal("撤销").click();
      }
      await select();
      await pal("谱号…").click();
      await p.locator(".vis-inline").fill("F");
      await p.locator(".vis-inline").press("Enter");
      assert.match(await p.evaluate(() => __app.getText()), /<sign>F<\/sign>/);
      await pal("撤销").click();
      await select();
      await pal("插入模式").click();
      await pal("新插的音落在第 2 声部").click();
      await pal("唱名 5").click();
      assert.ok(
        await p.evaluate(() =>
          __app
            .scoreDoc()
            .songs[0].parts[0].measures.some((m) =>
              m.elements.some((e) => e.voice === 2),
            ),
        ),
      );
      await p.locator("#btn-parts").click();
      await p.getByRole("button", { name: "按声线拆", exact: true }).click();
      assert.equal(
        await p.evaluate(() => __app.scoreDoc().songs[0].parts.length),
        2,
      );
      await p.getByRole("button", { name: "完成", exact: true }).click();
      await p.locator("#btn-view-staff").click();
      await p.waitForTimeout(200);
      await p.screenshot({ path: `${evidence}/musicxml.png` });
      await p.close();
    },
  );
  if (process.env.NOTA_EDITOR_PROJECT)
    await record(
      "real corrected project comparison, original-page tools and project reopen",
      async () => {
        const bytes = await readFile(process.env.NOTA_EDITOR_PROJECT),
          original = unzipSync(bytes);
        const p = await importFile("corrected.dolce", bytes);
        const before = await p.evaluate(() => __app.getText());
        for (const mode of [
          "none",
          "side",
          "follow",
          "floating",
          "inplace",
          "original",
        ]) {
          await p.locator("#sel-compare").selectOption(mode);
          await p.waitForTimeout(150);
          assert.equal(await p.locator("#sel-compare").inputValue(), mode);
          assert.equal(await p.evaluate(() => __app.getText()), before);
          await p.screenshot({ path: `${evidence}/compare-${mode}.png` });
        }
        await p.locator("#sel-compare").selectOption("side");
        await p.locator("#btn-src-pages").click();
        const rows = p.locator(".omr-pages-row"),
          thumb = () => rows.first().locator("img");
        await thumb().evaluate((i) => i.decode());
        const size = await thumb().evaluate((i) => [
          i.naturalWidth,
          i.naturalHeight,
        ]);
        await rows
          .first()
          .getByRole("button", { name: "旋转", exact: true })
          .click();
        await wait(
          async () =>
            (await thumb().evaluate((i) => i.naturalWidth)) === size[1],
        );
        await thumb().evaluate((i) => i.decode());
        assert.deepEqual(
          await thumb().evaluate((i) => [i.naturalWidth, i.naturalHeight]),
          [size[1], size[0]],
        );
        await rows
          .first()
          .getByRole("button", { name: "裁剪", exact: true })
          .click();
        await p.locator(".omr-crop-wrap img").evaluate((i) => i.decode());
        const box = await p.locator(".omr-crop-wrap img").boundingBox();
        await p.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.15);
        await p.mouse.down();
        await p.mouse.move(
          box.x + box.width * 0.85,
          box.y + box.height * 0.85,
          { steps: 8 },
        );
        await p.mouse.up();
        await p
          .locator(".omr-crop-bar")
          .getByRole("button", { name: "裁剪", exact: true })
          .click();
        await wait(
          async () => (await thumb().evaluate((i) => i.naturalWidth)) < size[1],
        );
        await thumb().evaluate((i) => i.decode());
        assert.ok((await thumb().evaluate((i) => i.naturalWidth)) < size[1]);
        const sourceName = Object.keys(original).find((k) =>
          k.startsWith("source/"),
        );
        await p
          .locator(".omr-pages input[type=file]")
          .setInputFiles({
            name: "second.png",
            mimeType: "image/png",
            buffer: Buffer.from(original[sourceName]),
          });
        await wait(async () => (await rows.count()) === 2);
        assert.equal(await rows.count(), 2);
        await rows
          .first()
          .getByRole("button", { name: "↓", exact: true })
          .click();
        await p.waitForTimeout(100);
        assert.equal(
          await rows.first().locator(".omr-pages-name").innerText(),
          "second.png",
        );
        await rows
          .first()
          .getByRole("button", { name: "删除", exact: true })
          .click();
        assert.equal(await rows.count(), 1);
        await p.screenshot({ path: `${evidence}/original-tools.png` });
        await p
          .locator(".modal-box")
          .getByRole("button", { name: "取消", exact: true })
          .click();
        assert.equal(await p.evaluate(() => __app.getText()), before);
        await p.locator("#btn-saveas").click();
        const download = p.waitForEvent("download");
        await p
          .locator(".modal-box")
          .getByRole("button", { name: /识别项目/ })
          .click();
        const saved = await readFile(await (await download).path());
        const roundtrip = unzipSync(saved);
        for (const name of Object.keys(original).filter((k) =>
          k.startsWith("source/"),
        ))
          assert.deepEqual(roundtrip[name], original[name]);
        assert.equal(new TextDecoder().decode(roundtrip["doc.txt"]), before);
        const reopened = await importFile("reopened.dolce", saved);
        assert.equal(await reopened.evaluate(() => __app.getText()), before);
        assert.ok(await reopened.locator("#score-pane svg").count());
        await reopened.close();
        // Commit a real image edit and rerun the original recognizer. The result is
        // intentionally not compared with a manually corrected score as if it were
        // automatic-OMR ground truth; only the editing/recognition workflow is tested.
        await p.locator("#btn-src-pages").click();
        for (let turn = 0; turn < 4; turn++) {
          await rows
            .first()
            .getByRole("button", { name: "旋转", exact: true })
            .click();
          const expected = turn % 2 === 0 ? size[1] : size[0];
          await wait(
            async () =>
              (await thumb().evaluate((i) => i.naturalWidth)) === expected,
          );
        }
        await p
          .locator(".modal-box")
          .getByRole("button", { name: "按这些页重新识别", exact: true })
          .click();
        await p
          .getByRole("button", { name: "放弃修改后继续", exact: true })
          .click();
        await p.waitForFunction(
          () =>
            /识别完成|识别失败/.test(
              document.querySelector("#status")?.textContent,
            ),
          null,
          { timeout: 35000 },
        );
        assert.match(await p.locator("#status").innerText(), /识别完成/);
        assert.ok(
          await p.evaluate(
            () => __app.scoreDoc().songs[0].parts[0].measures.length > 0,
          ),
        );
        await p.locator("#btn-saveas").click();
        const rerunDownload = p.waitForEvent("download");
        await p
          .locator(".modal-box")
          .getByRole("button", { name: /识别项目/ })
          .click();
        const rerun = unzipSync(
          await readFile(await (await rerunDownload).path()),
        );
        const sources = Object.keys(rerun).filter((k) =>
          k.startsWith("source/"),
        );
        assert.ok(sources.some((k) => k.endsWith(".png")));
        assert.notDeepEqual(rerun[sources[0]], original[sourceName]);
        await p.screenshot({ path: `${evidence}/rerun.png` });
        await p.close();
      },
    );
  else
    report.cases.push({
      name: "real corrected original-image project",
      status: "not-run",
      reason:
        "Set NOTA_EDITOR_PROJECT to a private corrected .dolce fixture; source files never enter Git.",
    });
  await record(
    "phrase layout, format marks, beat checking, zoom and code visibility",
    async () => {
      await setSource();
      await page.locator("#btn-phrase").click();
      assert.equal((await score()).songs[0].parts[0].measures.length, 2);
      await page.locator("#btn-layout-original").click();
      await page.locator("#btn-format-marks").click();
      await page.locator("#btn-beat-check").click();
      const zoom = await page.locator("#btn-zoom-reset").innerText();
      await page.locator("#btn-zoom-in").click();
      assert.notEqual(await page.locator("#btn-zoom-reset").innerText(), zoom);
      await page.locator("#btn-zoom-reset").click();
      assert.equal(await page.locator("#btn-zoom-reset").innerText(), "100%");
      await page.locator("#chk-code").uncheck();
      assert.equal(await page.locator(".cm-content").isVisible(), false);
      await page.locator("#chk-code").check();
      assert.equal(await page.locator(".cm-content").isVisible(), true);
    },
  );
  await record(
    "360, 390, 430, 848 and desktop retain original source/preview controls",
    async () => {
      await setSource();
      for (const width of [360, 390, 430, 848, 1440]) {
        await page.setViewportSize({ width, height: 923 });
        if (width <= 680) {
          await page.locator("#btn-mobile-code").click();
          await page.locator(".cm-content").waitFor({ state: "visible" });
          await page.locator("#btn-mobile-score").click();
        }
        await page
          .locator("#score-pane svg")
          .first()
          .waitFor({ state: "visible" });
        await wait(async () =>
          (await page.locator("#score-pane").innerText()).includes("验收乐谱"),
        );
        assert.equal(await text(), source);
        await page.screenshot({ path: `${evidence}/width-${width}.png` });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    },
  );
  assert.deepEqual(report.errors, []);
  await context.close();
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  if (browser)
    for (const [i, p] of browser
      .contexts()
      .flatMap((c) => c.pages())
      .entries()) {
      await p
        .screenshot({ path: `${evidence}/failure-${i}.png` })
        .catch(() => {});
      report.failure[`page${i}`] = await p
        .locator("body")
        .innerText()
        .catch(() => "closed");
    }
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(`${evidence}/report.json`, JSON.stringify(report, null, 2));
  await browser?.close();
  server.kill("SIGTERM");
  await rm(library, { recursive: true, force: true });
}
