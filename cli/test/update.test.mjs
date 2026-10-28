import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { libraryMiddleware } from '../../app/server/library.mjs';
const exec = promisify(execFile);
const packageDirectory = fileURLToPath(new URL('../', import.meta.url));
const score = { title: '局部更新样例', format: '123', text: 'X:1\nT:更新样例\nM:4/4\nK:1=C\n(1 2) 0 4 |: 5 6 7 1\' :|\nw:一二四五六七高\n', key:'1=C', meter:'4/4', presentation:{ noteSize:24, page:{width:210,height:297} }, source:{url:'https://example.org/source',license:'Synthetic fixture',validation:'source-compared',importedTextHash:''} };
score.source.importedTextHash = createHash('sha256').update(score.text).digest('hex');
async function fixture(t) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'nota-update-'));
  t.after(() => rm(temporary,{recursive:true,force:true}));
  const client = path.join(temporary,'client'), artifacts = path.join(temporary,'artifacts');
  await Promise.all([client,artifacts].map(d=>mkdir(d)));
  const packed = JSON.parse((await exec('npm',['pack',packageDirectory,'--pack-destination',artifacts,'--json'])).stdout)[0];
  await exec('npm',['install','--prefix',client,'--no-audit','--no-fund','--ignore-scripts',path.join(artifacts,packed.filename)]);
  const token=randomBytes(32).toString('hex'),credentials=path.join(temporary,'credentials.json');
  await writeFile(credentials,JSON.stringify({credentials:[{name:'fixture',sha256:createHash('sha256').update(token).digest('hex')}]}));
  const previous=process.env.NOTA_TOOL_CREDENTIALS_FILE;
  process.env.NOTA_TOOL_CREDENTIALS_FILE=credentials;
  t.after(()=>{if(previous===undefined)delete process.env.NOTA_TOOL_CREDENTIALS_FILE;else process.env.NOTA_TOOL_CREDENTIALS_FILE=previous;});
  const middleware=libraryMiddleware(path.join(temporary,'storage'));
  let loseUpdate=false,advanceAfterUpdate=false,hideRead=false,pending=false;
  const server=createServer((req,res)=>{
    if(pending&&hideRead&&req.method==='GET'){res.destroy();return;}
    if(req.method==='PUT'&&req.url.startsWith('/api/agent/library/')){
      const end=res.end.bind(res);
      res.end=(...args)=>{pending=true;if(advanceAfterUpdate){advanceAfterUpdate=false;const saved=JSON.parse(args[0]);void raw(`/${saved.id}`,'PUT',{revision:saved.revision,title:'另一维护者随后更新'}).then(()=>end(...args));return res;}if(loseUpdate){res.destroy();return res;}return end(...args);};
    }
    void middleware(req,res,()=>{res.writeHead(404);res.end();});
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>server.close(r)));
  const url=`http://127.0.0.1:${server.address().port}`;
  const raw=async(suffix,method='GET',payload)=>fetch(`${url}/api/agent/library${suffix}`,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});
  const run=async(args,payload)=>{
    if(payload)await writeFile(path.join(client,'proposal.json'),JSON.stringify(payload));
    try{const result=await exec(process.execPath,[path.join(client,'node_modules/.bin/nota-library'),...args],{cwd:client,env:{...process.env,NOTA_CONFIG:path.join(client,'config.json'),NOTA_URL:url,NOTA_TOKEN:token}});return{code:0,output:JSON.parse(result.stdout)};}
    catch(error){return{code:error.code,output:JSON.parse(error.stdout)};}
  };
  const seeded=await raw('','POST',score);
  assert.equal(seeded.status,201,await seeded.clone().text());
  const record=await (await raw(`/${(await seeded.json()).id}`)).json();
  return{run,raw,record,client,lose:()=>{loseUpdate=true;},hide:()=>{pending=false;hideRead=true;},advance:()=>{advanceAfterUpdate=true;}};
}

test('安装的CLI按编号和版本预检、局部纠错及回读，保留歌词来源版式并报告实际改动',async t=>{
  const{run,raw,record}=await fixture(t);
  const proposal={text:score.text.replace('(1 2)','(1 3)')};
  const checked=await run(['check',record.id,'--revision','1','--file','proposal.json'],proposal);
  assert.equal(checked.code,0,JSON.stringify(checked.output));
  assert.deepEqual(checked.output.data.changes.changedMeasures,[{song:1,part:1,measure:1}]);
  assert.equal((await(await raw(`/${record.id}`)).json()).revision,1);
  const updated=await run(['update',record.id,'--revision','1','--file','proposal.json']);
  assert.equal(updated.code,0,JSON.stringify(updated.output));
  const saved=updated.output.data.record;
  assert.equal(saved.id,record.id);assert.equal(saved.revision,2);assert.equal(saved.text,proposal.text);
  assert.deepEqual(saved.presentation,score.presentation);assert.equal(saved.source.license,score.source.license);assert.equal(saved.source.edited,true);
  assert.equal(updated.output.data.check.changes.rhythmChanged,false);assert.equal(updated.output.data.check.changes.structureChanged,false);
  assert.equal(updated.output.data.check.changes.pitchChanges[0].before,62);assert.equal(updated.output.data.check.changes.pitchChanges[0].after,64);
  assert.match(updated.output.data.url,/song=/);
  const renamed=await run(['update',record.id,'--revision','2','--file','proposal.json'],{title:'新曲名',source:{url:'https://example.org/updated'},presentation:{page:{width:220}}});
  assert.equal(renamed.code,0,JSON.stringify(renamed.output));
  assert.deepEqual(renamed.output.data.record.presentation,{noteSize:24,page:{width:220,height:297}});assert.equal(renamed.output.data.record.source.license,score.source.license);assert.equal(renamed.output.data.record.text,proposal.text);
  const conflict=await run(['update',record.id,'--revision','2','--file','proposal.json'],{title:'过期修改'});
  assert.equal(conflict.code,6);assert.equal((await(await raw(`/${record.id}`)).json()).title,'新曲名');
});

test('更新基于旧谱区分弱起与意外漏拍，直接PUT也不能绕过',async t=>{
  const{run,raw,record}=await fixture(t);
  const short={text:score.text.replace('(1 2) 0 4','(1 2) 0')};
  const checked=await run(['check',record.id,'--revision','1','--file','proposal.json'],short);
  assert.equal(checked.code,7);
  const report=checked.output.data;
  assert.ok(report.diagnostics.some(d=>d.code==='measure_duration'&&d.measure===1));
  const direct=await raw(`/${record.id}`,'PUT',{...short,revision:1});
  assert.equal(direct.status,422);
  assert.equal((await(await raw(`/${record.id}`)).json()).revision,1);
  const pickup={...score,title:'已有弱起',text:'X:1\nM:4/4\nK:1=C\n1 | 1 2 3 4 | 1 2 3 |]'};
  const created=(await run(['create','--file','proposal.json'],pickup)).output.data.record;
  const updated=await run(['update',created.id,'--revision','1','--file','proposal.json'],{text:pickup.text.replace('1 |','2 |')});
  assert.equal(updated.code,0,JSON.stringify(updated.output));
});

test('实际移调和重新记谱分别检查统一音程与逐音音高，保留节奏歌词连线反复',async t=>{
  const{run,raw,record}=await fixture(t);
  const moved=score.text.replace('K:1=C','K:1=D');
  const wrongInterval=await run(['update',record.id,'--revision','1','--file','proposal.json'],{text:moved,intent:{kind:'transpose',semitones:3}});
  assert.equal(wrongInterval.code,7);
  assert.ok(wrongInterval.output.data.diagnostics.some(d=>d.code==='transpose_interval'));
  const transposed=await run(['update',record.id,'--revision','1','--file','proposal.json'],{text:moved,key:'1=D',intent:{kind:'transpose',semitones:2}});
  assert.equal(transposed.code,0,JSON.stringify(transposed.output));
  assert.equal(transposed.output.data.check.changes.pitchShift,2);
  const fakeRenotation=await run(['update',record.id,'--revision','2','--file','proposal.json'],{text:score.text,intent:{kind:'renotate'}});
  assert.equal(fakeRenotation.code,7);
  assert.ok(fakeRenotation.output.data.diagnostics.some(d=>d.code==='renotate_pitch'));
  const renotated=moved.replace('K:1=D','K:1=C').replace('(1 2) 0 4 |: 5 6 7 1\' :|','(2 3) 0 5 |: 6 7 #1\' 2\' :|');
  const result=await run(['update',record.id,'--revision','2','--file','proposal.json'],{text:renotated,key:'1=C',intent:{kind:'renotate'}});
  assert.equal(result.code,0,JSON.stringify(result.output));
  assert.deepEqual(result.output.data.check.changes.pitchChanges,[]);
  const structureChanged=renotated.replace(':|','|]');
  const rejected=await run(['update',record.id,'--revision','3','--file','proposal.json'],{text:structureChanged,intent:{kind:'renotate'}});
  assert.equal(rejected.code,7);
  assert.ok(rejected.output.data.diagnostics.some(d=>d.code==='conversion_structure'));
  assert.equal((await(await raw(`/${record.id}`)).json()).revision,3);
});

test('更新响应丢失只回读核实，回读已有后续修改或不可读时返回结果未确认',async t=>{
  const{run,raw,record,client,lose,hide}=await fixture(t);
  lose();
  const recovered=await run(['update',record.id,'--revision','1','--file','proposal.json'],{title:'确认响应丢失后的保存'});
  assert.equal(recovered.code,0,JSON.stringify(recovered.output));
  assert.equal(recovered.output.data.record.revision,2);
  assert.equal((await(await raw(`/${record.id}`)).json()).revision,2);
  hide();
  const unknown=await run(['update',record.id,'--revision','2','--file','proposal.json'],{title:'未确认提案'});
  assert.equal(unknown.code,8);assert.equal(unknown.output.code,'result_unconfirmed');
  assert.equal(JSON.parse(await readFile(path.join(client,'proposal.json'),'utf8')).title,'未确认提案');
});

test('回读期间其他维护者再次修改，不把最新版冒充本次保存结果',async t=>{
  const{run,raw,record,advance}=await fixture(t);
  advance();
  const result=await run(['update',record.id,'--revision','1','--file','proposal.json'],{title:'本次更新'});
  assert.equal(result.code,8,JSON.stringify(result.output));
  assert.equal(result.output.data.actualRevision,3);
  assert.equal((await(await raw(`/${record.id}`)).json()).title,'另一维护者随后更新');
});

test('倚音临时记号不污染主旋律的实际音高对照',async t=>{
  const{run}=await fixture(t);
  const grace={...score,title:'倚音对照',text:'X:1\nM:3/4\nK:1=C\n{b3}3 3 n3 |]'};
  const created=(await run(['create','--file','proposal.json'],grace)).output.data.record;
  const updated=await run(['update',created.id,'--revision','1','--file','proposal.json'],{text:grace.text.replace('{b3}3 3','{b3}b3 3')});
  assert.equal(updated.code,0,JSON.stringify(updated.output));
  const changes=updated.output.data.check.changes.pitchChanges;
  assert.deepEqual(changes.map(c=>[c.event,c.before,c.after]),[[2,64,63],[3,64,63]]);
});

test('未接通同步的原图项目拒绝远程更新，不能删掉附件绕过',async t=>{
  const{run,raw}=await fixture(t);
  const {createRequire}=await import('node:module');
  const {zipSync,strToU8}=createRequire(new URL('../../app/package.json',import.meta.url))('fflate');
  const project=Buffer.from(zipSync({'manifest.json':strToU8(JSON.stringify({version:1,kind:'vector',docFormat:'123',sources:[{file:'source/0.pdf',name:'fixture.pdf',mime:'application/pdf'}]})),'doc.txt':strToU8(score.text),'source/0.pdf':strToU8('%PDF-synthetic-fixture')})).toString('base64');
  const created=await run(['create','--file','proposal.json'],{...score,title:'未接通原图更新',project});
  assert.equal(created.code,0,JSON.stringify(created.output));
  const record=created.output.data.record;
  const rejected=await run(['update',record.id,'--revision','1','--file','proposal.json'],{title:'不能借元数据剥图',project:''});
  assert.equal(rejected.code,7);
  assert.ok(rejected.output.data.diagnostics.some(d=>d.code==='project_update_unsupported'));
  const after=await(await raw(`/${record.id}`)).json();
  assert.equal(after.project,project);assert.equal(after.revision,1);
});
