import test from "node:test";
import assert from "node:assert/strict";
import { xmlSource } from "./xml-reference.mjs";
import { structuredRuntime } from "./structured-runtime.mjs";
import { prepareSource, permittedSource, createSourceSearch } from "./score-import.mjs";
const note = (step, octave, duration, extra = "") =>
  `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><type>quarter</type>${extra}</note>`;
const xml = `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>test</work-title></work><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time></attributes>${note("C", 5, 4, '<notations><slur type="start" number="1"/></notations>')}${note("C", 5, 4)}${note("D", 5, 4, '<notations><slur type="stop" number="1"/></notations>')}<barline location="right"><repeat direction="backward"/></barline></measure></part></score-partwise>`;
test("native MusicXML retains high octaves, repeated attacks, slurs and repeat", async () => {
  const api = await structuredRuntime();
  const { xml: selected, reference } = xmlSource(xml);
  const ready = api.prepareStructuredScore({
    text: selected,
    format: "musicxml",
    reference,
  });
  assert.equal(ready.format, "musicxml");
  assert.equal(ready.notes, 3);
  assert.equal(ready.reference.events[0][0].midi, 72);
  assert.equal(ready.reference.events[0].length, 3);
  assert.equal(ready.reference.spans.length, 1);
  for (const bad of [
    selected.replace("<octave>5</octave>", "<octave>4</octave>"),
    selected.replace('<repeat direction="backward"/>', ""),
    selected.replace(/<slur[^>]*\/>/g, ""),
  ])
    assert.throws(
      () =>
        api.prepareStructuredScore({
          text: bad,
          format: "musicxml",
          reference,
        }),
      /未通过导入校验/,
    );
  const tied = selected
    .replace("</type>", '</type><tie type="start"/>')
    .replace(note("C", 5, 4), note("C", 5, 4, '<tie type="stop"/>'));
  assert.throws(
    () =>
      api.prepareStructuredScore({ text: tied, format: "musicxml", reference }),
    /未通过导入校验/,
    "same pitch count but changed attacks must fail",
  );
});
test("source preparation preserves original hash and does not write library", async () => {
  const spec = {
    url: "https://www.gutenberg.org/files/test.musicxml",
    format: "musicxml",
    title: "测试旋律",
    license: "Test fixture",
  };
  const ready = await prepareSource(spec, Buffer.from(xml));
  assert.equal(ready.schema, "nota.score-candidate.v1");
  assert.equal(ready.sourceCompared, true);
  assert.equal(ready.source.sha256.length, 64);
  assert.equal(ready.title, "测试旋律");
  assert.equal(ready.source.validation, "source-compared");
});
test("unsupported or non-score input and unsafe URLs are rejected", () => {
  for (const url of [
    "http://127.0.0.1/file",
    "https://localhost/file",
    "https://www.gutenberg.org:8443/file",
    "https://www.gutenberg.org@127.0.0.1/file",
    "https://raw.githubusercontent.com/other/repo/main/file",
  ])
    assert.throws(() => permittedSource(url));
  assert.throws(() => xmlSource("<html><body>not a score</body></html>"));
  assert.throws(() =>
    xmlSource(
      xml.replace(
        "<attributes>",
        "<backup><duration>4</duration></backup><attributes>",
      ),
    ),
  );
});

test("implicit pickup still exempts its matching final short measure",async()=>{
 const api=await structuredRuntime();
 const pickup=xml.replace('<measure number="1">','<measure number="1" implicit="yes">').replace(note('C',5,4,'<notations><slur type="start" number="1"/></notations>')+note('C',5,4)+note('D',5,4,'<notations><slur type="stop" number="1"/></notations>'),note('C',5,2)).replace('<barline location="right"><repeat direction="backward"/></barline></measure>', '</measure><measure number="2">'+note('C',5,12)+'</measure><measure number="3">'+note('C',5,10)+'</measure>');
 const source=xmlSource(pickup);
 const candidate=api.prepareStructuredScore({text:source.xml,format:'musicxml',reference:source.reference});
 assert.equal(candidate.measures,3);
});


test("Chinese composer queries use exactly the same bounded holdings as English",async()=>{
 const paths=["scores/Beethoven,_Ludwig_van/Op.48/1_Bitten/a.mxl","scores/Chopin,_Frédéric/Op.74/1_Życzenie/b.mxl","scores/Schubert,_Franz/Op.98/Wiegenlied/c.mxl","scores/Brahms,_Johannes/Op.49/Wiegenlied/d.mxl"];
 const search=createSourceSearch(async()=>new Response(JSON.stringify({tree:paths.map(path=>({path,type:"blob"}))})));
 for(const [zh,en] of [["贝多芬","Beethoven"],["肖邦","Chopin"]]){
  const chinese=await search(zh),english=await search(en);
  assert.deepEqual(chinese.map(i=>i.url),english.map(i=>i.url));
  assert.ok(chinese.length>0);
 }
 const lullabies=await search("摇篮曲");
 assert.equal(lullabies.filter(i=>i.title.includes("Wiegenlied")).length,2,"Keep distinct composers and editions");
 assert.ok(lullabies.every(i=>!i.edition.includes("检查单旋律")),"Search results cannot claim an unread part was validated");
});

test("source index remains bounded and a failed/truncated index can retry",async()=>{
 let attempt=0;
 const search=createSourceSearch(async()=>{
  attempt++;
  if(attempt===1) return new Response(JSON.stringify({truncated:true,tree:[]}));
  return new Response(JSON.stringify({tree:Array.from({length:25},(_,i)=>({type:"blob",path:`scores/Beethoven,_Ludwig_van/Collection/Song_${i}/score.mxl`}))}));
 });
 await assert.rejects(search("贝多芬"),/索引不完整/);
 assert.equal((await search("Beethoven")).length,20);
 assert.equal((await search("贝多芬")).length,20);
 assert.equal(attempt,2,"Retry index is cached after a successful complete response");
 const empty=createSourceSearch(async()=>new Response(JSON.stringify({tree:[]})));
 assert.deepEqual(await empty("肖邦"),await empty("Chopin"),"Same holdings may validly have no works for either alias");
});
