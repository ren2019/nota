// 应用会话的读入边界：真实临时曲库与项目序列化；App/布局仍由浏览器验证。
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { libraryMiddleware } from '../server/library.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
await build({entryPoints: [`${root}/src/nota/document-session.ts`], outfile: `${root}/out/document-session-check.mjs`, bundle: true, format:'esm', platform:'node'});
const { readLibraryScore, writeLibraryScore, renameLibraryScore, deleteLibraryScore, documentRenderState } = await import(pathToFileURL(`${root}/out/document-session-check.mjs`));
await build({stdin: {contents: 'export {packProject,unpackProject} from "./src/editor/omrproject"; export {parse123} from "./src/j123/parse";', resolveDir: root}, outfile: `${root}/out/document-session-fixture.mjs`, bundle: true, format:'esm', platform:'node'});
const {packProject, unpackProject, parse123} = await import(pathToFileURL(`${root}/out/document-session-fixture.mjs`));
const directory = await mkdtemp(`${tmpdir()}/nota-document-`);
const middleware = libraryMiddleware(directory);
let delayedRead=null;
const server = createServer((req,res) => {
  if(delayedRead && req.method === 'GET') {
    const {arrived,release}=delayedRead; delayedRead=null; arrived();
    void release.then(() => middleware(req,res,() => {res.writeHead(404);res.end();}));
  } else void middleware(req,res,() => {res.writeHead(404);res.end();});
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const endpoint = `http://127.0.0.1:${server.address().port}/api/library`;
try {
  const text = 'T:印刷标题\nM:4/4\nK:1=Eb\n1 2 3 4 |]\n';
  const project = packProject({kind:'vector', docFormat:'123', text, emitted:text, sources:[{name:'原谱.pdf', mime:'application/pdf', bytes:new Uint8Array([37,80,68,70])}]},'test');
  const payload = {source:{url:'https://example.org/source',license:'Public domain',method:'source-import'},title:'家里的练习版本',format:'123',text,key:'1=Eb',meter:'4/4', project: Buffer.from(project).toString('base64'), presentation:{mode:'original',noteSize:24,paper:'A4',orientation:'landscape',margin:[20,30,20,30],render:{styleLayers:{projection:[],print:[{set:{page:{paper:'A4',orientation:'landscape'}}}],staff:[],header:[]},bookLayer:[],jianpuAccidentals:'measure',practiceFontSize:24,showLyrics:false,mixedHideBarNumber:true,mixedShowJianpuLayer:true}}};
  const response = await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
  assert.equal(response.status,201);
  const saved = await response.json();
  const opened = await readLibraryScore(saved.id, endpoint);
  assert.equal(opened.score.id,saved.id);
  assert.equal(opened.score.revision,1);
  assert.equal(opened.score.title,'家里的练习版本');
  assert.equal(opened.score.text,text);
  assert.equal(parse123(opened.score.text).songs[0].work.title,'印刷标题');
  assert.deepEqual(opened.score.presentation,payload.presentation);
  const localRender=documentRenderState(opened.score.presentation.render);
  assert.equal(localRender.jianpuAccidentals,undefined,'opening a record cannot restore browser-wide accidental preference');
  assert.equal(localRender.practiceFontSize,undefined,'opening a record cannot restore browser-wide practice preset');
  assert.deepEqual(localRender.styleLayers,payload.presentation.render.styleLayers,'document-specific paper/style still restored');

  assert.deepEqual(unpackProject(opened.project).sources[0].bytes,new Uint8Array([37,80,68,70]));
  // Reopening reads the same revision; neither opening nor navigation writes.
  const reopened = await readLibraryScore(saved.id, endpoint);
  assert.deepEqual(reopened.score,opened.score);
  let releaseRead,readArrived;
  const release=new Promise(resolve => {releaseRead=resolve;});
  const arrived=new Promise(resolve => {readArrived=resolve;});
  delayedRead={arrived:readArrived,release};
  let currentDraft=text;
  const pendingOpen=readLibraryScore(saved.id,endpoint,() => currentDraft === text);
  await arrived;currentDraft=text.replace('1 2 3 4','7 2 3 4');releaseRead();
  await assert.rejects(pendingOpen,/修改|changed/i,'late response must not replace a draft edited during the request');
  assert.match(currentDraft,/7 2 3 4/);
  const changedText=text.replace('1 2 3 4','5 2 3 4');
  const editedProject=packProject({...unpackProject(project),text:changedText},'test');
  const edited={...payload,text:changedText,project:Buffer.from(editedProject).toString('base64')};
  const updated=await writeLibraryScore(edited,saved,endpoint);
  assert.equal(updated.id,saved.id); assert.equal(updated.revision,2);
  assert.equal((await readLibraryScore(saved.id,endpoint)).score.text,changedText);
  await assert.rejects(writeLibraryScore(payload,saved,endpoint),error => error.status === 409);
  const copy=await writeLibraryScore({...edited,title:'保留我的副本'},null,endpoint);
  assert.notEqual(copy.id,saved.id); assert.equal(copy.revision,1);
  assert.equal((await readLibraryScore(saved.id,endpoint)).score.revision,2);
  await assert.rejects(writeLibraryScore({...payload,text:''},null,endpoint),error => error.status === 400);

  await assert.rejects(readLibraryScore('invalid-id', endpoint), /不存在|找到|无效/);
  assert.equal((await (await fetch(endpoint)).json()).length,2);
  const broken = await (await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,title:'损坏恢复稿',project:'AAAA'})})).json();
  await assert.rejects(readLibraryScore(broken.id,endpoint), /原图项目暂时无法恢复/);
  const committed=(await readLibraryScore(saved.id,endpoint)).score;
  const renamed=await renameLibraryScore(updated,'保留我的副本',endpoint);
  assert.equal(renamed.id,saved.id);assert.equal(renamed.revision,3);
  const renamedRecord=(await readLibraryScore(saved.id,endpoint)).score;
  const {title:_oldTitle,revision:_oldRevision,updatedAt:_oldTime,...unchanged}=committed;
  const {title:_newTitle,revision:_newRevision,updatedAt:_newTime,...afterRename}=renamedRecord;
  assert.deepEqual(afterRename,unchanged);
  assert.equal(parse123(renamedRecord.text).songs[0].work.title,'印刷标题');
  assert.equal((await readLibraryScore(copy.id,endpoint)).score.title,'保留我的副本');
  await assert.rejects(renameLibraryScore(updated,'不能静默覆盖',endpoint),error => error.status === 409);
  await assert.rejects(deleteLibraryScore(updated,endpoint),error => error.status === 409);
  assert.equal((await readLibraryScore(saved.id,endpoint)).score.revision,3);
  await deleteLibraryScore(renamed,endpoint);
  await assert.rejects(readLibraryScore(saved.id,endpoint),error => error.status === 404);
  assert.equal((await readLibraryScore(copy.id,endpoint)).score.text,changedText);
  console.log('Document library boundary: real save/reopen preserves identity, title, body, original bytes and full layout; revisions, 409/copy, rejected writes and broken recovery are verified.');
} finally {
  await new Promise(resolve => server.close(resolve));
  await rm(directory,{recursive:true,force:true});
}
