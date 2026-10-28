import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {zipSync,unzipSync,strToU8,strFromU8} from '../../app/node_modules/fflate/esm/index.mjs';
import sharp from '../../app/node_modules/sharp/dist/index.mjs';
import {libraryMiddleware} from '../../app/server/library.mjs';
const exec=promisify(execFile);
const text='X:1\nT:Image test\nC:Fixture\nM:4/4\nK:1=C\n1 2 3 4 |]\nw:一二三四\n';
const body=text.indexOf('1 2 3 4'),lyric=text.indexOf('一二三四');
async function fixture(t){
 const temporary=await mkdtemp(path.join(tmpdir(),'nota-project-'));t.after(()=>rm(temporary,{recursive:true,force:true}));
 const client=path.join(temporary,'client'),artifacts=path.join(temporary,'artifacts');await Promise.all([client,artifacts].map(d=>mkdir(d)));
 const packed=JSON.parse((await exec('npm',['pack',fileURLToPath(new URL('../',import.meta.url)),'--pack-destination',artifacts,'--json'])).stdout)[0];
 await exec('npm',['install','--prefix',client,'--no-audit','--no-fund','--ignore-scripts',path.join(artifacts,packed.filename)]);
 const png=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><rect width="200" height="60" fill="white"/><text x="10" y="40" font-size="28">1　2　3　4</text></svg>')).png().toBuffer();
 const ranges=[0,2,4,6].map(n=>({from:body+n,to:body+n+1}));
 const meta={noteRanges:ranges,lyricRanges:ranges.map((_,i)=>({__map:[[0,{from:lyric+i,to:lyric+i+1}]]})),titleRange:{from:6,to:16},authorRanges:[{text:'Fixture',range:{from:19,to:26}}],future:{preserve:'unknown meta'}};
 // A synthetic, valid image project; real-song image/point selection is a separate private journey.
 const files={'manifest.json':strToU8(JSON.stringify({version:1,app:'synthetic',kind:'jianpu',docFormat:'123',omrFormat:'123',sources:[{file:'source/0.png',name:'synthetic.png',mime:'image/png'}],bin:{w:200,h:60},future:{keep:42}})),
 'doc.txt':strToU8(text),'emitted.txt':strToU8(text),'source/0.png':png,'result/bin.raw':new Uint8Array(12000),
 'result/recognized.json':strToU8(JSON.stringify({key:'C',beats:4,beatType:4,title:'Image test',rows:[{topY:0,bottomY:60,nums:[1,2,3,4].map((digit,i)=>({digit,bbox:{x:10+i*45,y:10,w:20,h:40},dot:0,octave:0,div:0,augment:0})),barlineXs:[]}]})),
 'result/meta.json':strToU8(JSON.stringify(meta)),'future/opaque.bin':new Uint8Array([1,9,2,8,3,7])};
 const score={title:'Image fixture',format:'123',text,project:Buffer.from(zipSync(files)).toString('base64'),presentation:{mode:'original'},source:{url:'https://example.org/synthetic',license:'Synthetic test',importedTextHash:createHash('sha256').update(text).digest('hex')}};
 const token=randomBytes(32).toString('hex'),credentials=path.join(temporary,'credentials.json');await writeFile(credentials,JSON.stringify({credentials:[{sha256:createHash('sha256').update(token).digest('hex')}]}));
 const old=process.env.NOTA_TOOL_CREDENTIALS_FILE;process.env.NOTA_TOOL_CREDENTIALS_FILE=credentials;t.after(()=>{if(old===undefined)delete process.env.NOTA_TOOL_CREDENTIALS_FILE;else process.env.NOTA_TOOL_CREDENTIALS_FILE=old;});
 const middleware=libraryMiddleware(path.join(temporary,'storage'));let lose=false,corrupt=false,updated=false;
 const server=createServer((req,res)=>{
  const end=res.end.bind(res);
  res.end=(...args)=>{
   if(req.method==='PUT'){updated=true;if(lose){res.destroy();return res;}}
   if(corrupt&&updated&&req.method==='GET'&&res.statusCode===200){const body=JSON.parse(args[0]);if(body.project)args[0]=JSON.stringify({...body,project:score.project});}
   return end(...args);
  };
  void middleware(req,res,()=>{res.writeHead(404);res.end();});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const url=`http://127.0.0.1:${server.address().port}`;
 const raw=async(suffix='',method='GET',payload)=>fetch(`${url}/api/agent/library${suffix}`,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});
 const run=async(args,payload)=>{if(payload)await writeFile(path.join(client,'proposal.json'),JSON.stringify(payload));try{const r=await exec(process.execPath,[path.join(client,'node_modules/.bin/nota-library'),...args],{cwd:client,env:{...process.env,NOTA_URL:url,NOTA_TOKEN:token,NOTA_CONFIG:path.join(client,'config.json')}});return{code:0,output:JSON.parse(r.stdout)};}catch(e){return{code:e.code,output:JSON.parse(e.stdout)};}};
 const created=await raw('','POST',score);assert.equal(created.status,201,await created.clone().text());const record=await(await raw('/'+(await created.json()).id)).json();
 return{run,raw,record,files,lose:()=>{lose=true;},corrupt:()=>{corrupt=true;},clean:()=>{corrupt=false;}};
}

test('安装CLI同步原图音符修改和多处源码偏移，完整保留原件、未知内容及歌词版式',async t=>{
 const{run,raw,record,files}=await fixture(t);
 const prefix='% remote edit\n';
 const proposal={text:prefix+text.replace('1 2 3 4','1 #2 3 4'),edits:[{from:0,to:0,insert:prefix},{from:body+2,to:body+3,insert:'#2'}]};
 const checked=await run(['check',record.id,'--revision','1','--file','proposal.json'],proposal);
 assert.equal(checked.code,0,JSON.stringify(checked.output));assert.equal((await(await raw('/'+record.id)).json()).revision,1);
 const updated=await run(['update',record.id,'--revision','1','--file','proposal.json']);assert.equal(updated.code,0,JSON.stringify(updated.output));
 const saved=updated.output.data.record,entries=unzipSync(Buffer.from(saved.project,'base64'));
 assert.equal(saved.revision,2);assert.equal(saved.text,proposal.text);assert.deepEqual(saved.presentation,record.presentation);assert.equal(saved.source.license,record.source.license);
 assert.deepEqual(Object.keys(entries).sort(),Object.keys(files).sort());
 for(const key of Object.keys(files).filter(k=>!['doc.txt','result/meta.json'].includes(k)))assert.deepEqual(entries[key],new Uint8Array(files[key]),key+' bytes preserved');
 assert.equal(strFromU8(entries['doc.txt']),proposal.text);
 const meta=JSON.parse(strFromU8(entries['result/meta.json']));assert.deepEqual(meta.future,{preserve:'unknown meta'});
 assert.deepEqual(meta.noteRanges.map(r=>proposal.text.slice(r.from,r.to)),['1','#2','3','4']);
 assert.deepEqual(meta.noteRanges.map(r=>r.from),[body+prefix.length,body+2+prefix.length,body+5+prefix.length,body+7+prefix.length]);
 assert.deepEqual(meta.lyricRanges.map(m=>proposal.text.slice(m.__map[0][1].from,m.__map[0][1].to)),['一','二','三','四']);
 assert.equal(checked.output.data.projectUpdate.sha256,createHash('sha256').update(Buffer.from(saved.project,'base64')).digest('hex'));
});

test('无效局部范围、未声明改文、整篇替换及删除附件均拒绝，原记录不变',async t=>{
 const{run,raw,record}=await fixture(t);
 const changed=text.replace('1 2 3 4','1 3 3 4');
 for(const proposal of [
  {text:changed},
  {text:changed,edits:[{from:0,to:text.length,insert:changed}]},
  {text:changed,edits:[{from:body+2,to:body+3,insert:'4'}]},
  {text:changed,edits:[{from:body+3,to:body+4,insert:' '},{from:body+2,to:body+3,insert:'3'}]},
  {text:changed,edits:[{from:body+2,to:text.length+1,insert:'3'}]},
  {project:''},
  {text,edits:[{from:0,to:1,insert:'wrong'}]},
 ]){
  const rejected=await run(['update',record.id,'--revision','1','--file','proposal.json'],proposal);
  assert.equal(rejected.code,7,JSON.stringify(rejected.output));
  assert.ok(rejected.output.data.diagnostics.some(d=>d.code==='project_mapping'));
  assert.deepEqual(await(await raw('/'+record.id)).json(),record);
 }
});

test('保存响应丢失仍按预检项目哈希回读，旧来源注释前缀保留并迁移定位',async t=>{
 const{run,raw,record,lose}=await fixture(t);
 const prefix='% legacy source\n';
 // Older records may have source comments outside doc.txt. This is a supported read boundary.
 const legacy=await raw('','POST',{...record,title:'Legacy image fixture',text:prefix+text});assert.equal(legacy.status,201,await legacy.clone().text());
 const legacyId=(await legacy.json()).id;
 const newText=prefix+text.replace('1 2 3 4','1 #2 3 4');
 const proposal={text:newText,edits:[{from:prefix.length+body+2,to:prefix.length+body+3,insert:'#2'}]};
 const checked=await run(['check',legacyId,'--revision','1','--file','proposal.json'],proposal);assert.equal(checked.code,0,JSON.stringify(checked.output));
 await new Promise(resolve=>setTimeout(resolve,2100));lose();
 const saved=await run(['update',legacyId,'--revision','1','--file','proposal.json']);assert.equal(saved.code,0,JSON.stringify(saved.output));
 const entries=unzipSync(Buffer.from(saved.output.data.record.project,'base64'));
 assert.equal(strFromU8(entries['doc.txt']),newText);assert.equal(strFromU8(entries['emitted.txt']),text);
 assert.equal(createHash('sha256').update(Buffer.from(saved.output.data.record.project,'base64')).digest('hex'),checked.output.data.projectUpdate.sha256);
});

test('旧项目的损坏定位和改变原图音符数量的编辑在写入前被拒绝',async t=>{
 const{run,raw,record,files}=await fixture(t);
 const broken=JSON.parse(strFromU8(files['result/meta.json']));broken.noteRanges[1]={from:0,to:1};
 const project=Buffer.from(zipSync({...files,'result/meta.json':strToU8(JSON.stringify(broken))})).toString('base64');
 const created=await raw('','POST',{...record,title:'Legacy damaged mapping',project});assert.equal(created.status,201,await created.clone().text());
 const id=(await created.json()).id,before=await(await raw('/'+id)).json();
 const proposal={text:text.replace('1 2 3 4','1 #2 3 4'),edits:[{from:body+2,to:body+3,insert:'#2'}]};
 const rejected=await run(['update',id,'--revision','1','--file','proposal.json'],proposal);assert.equal(rejected.code,7);
 assert.ok(rejected.output.data.diagnostics.some(d=>d.code==='project_mapping'&&d.source));
 assert.deepEqual(await(await raw('/'+id)).json(),before);
 const added=await run(['update',record.id,'--revision','1','--file','proposal.json'],{text:text.replace('1 2 3 4','1_ 1_ 2 3 4'),edits:[{from:body,to:body+1,insert:'1_ 1_'}]});
 assert.equal(added.code,7);assert.deepEqual(await(await raw('/'+record.id)).json(),record);
});


test('回读附件与预检哈希不符时报告未确认，不能用相同元数据掩盖差异',async t=>{
 const{run,raw,record,corrupt,clean}=await fixture(t);
 const changed=text.replace('1 2 3 4','1 #2 3 4');
 corrupt();
 const result=await run(['update',record.id,'--revision','1','--file','proposal.json'],{text:changed,edits:[{from:body+2,to:body+3,insert:'#2'}]});
 assert.equal(result.code,8);assert.equal(result.output.code,'result_unconfirmed');
 clean();const actual=await(await raw('/'+record.id)).json();assert.equal(actual.revision,2);assert.equal(actual.text,changed);assert.notEqual(actual.project,record.project);
});
