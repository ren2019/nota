// Build an explicit Web-source archive, never a copy of the working directory.
import { readdir, lstat, readFile, mkdir, writeFile, mkdtemp, rm, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const top=JSON.parse(await readFile(path.join(root,'release-files.json'),'utf8'));
if(!Array.isArray(top)||top.some(p=>typeof p!=='string'||path.isAbsolute(p)||p.split('/').includes('..')))throw Error('Invalid release allowlist');
const forbidden=new Set(['node_modules','out','local','.git','.upstream','src-tauri','testdata','dev','logs','coverage','__pycache__']);
const desktop=new Set(['app/scripts/release.sh','app/scripts/win-crt.mjs','app/scripts/vcredist.mjs']);
const files=[];
async function visit(relative){
  if(relative.split('/').some(p=>forbidden.has(p))||desktop.has(relative))return;
  const base=path.basename(relative);if(base.startsWith('.env')||base.endsWith('.log')||base==='.DS_Store')return;
  const info=await lstat(path.join(root,relative));if(info.isSymbolicLink())throw Error(`Refusing symlink: ${relative}`);
  if(info.isDirectory()){for(const child of (await readdir(path.join(root,relative))).sort())await visit(`${relative}/${child}`);return;}
  if(info.isFile())files.push(relative);
}
for(const item of top)await visit(item);
try{await visit('app/public/licenses/npm');}catch(e){if(e.code!=='ENOENT')throw e;}

const staging=await mkdtemp(path.join(tmpdir(),'nota-web-release-'));
try{
  const manifest=[];
  for(const relative of files.sort()){
    const bytes=await readFile(path.join(root,relative));
    if(relative.endsWith('.md')&&/chatgpt\.com\/share\//i.test(bytes.toString()))throw Error(`Private conversation link in ${relative}`);
    const target=path.join(staging,'nota',relative);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(root,relative),target);
    manifest.push({path:relative,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  await writeFile(path.join(staging,'nota','RELEASE_MANIFEST.json'),JSON.stringify({kind:'Nota Web source; no Git history or desktop package',files:manifest},null,2)+'\n');
  const output=path.join(root,'local/releases');await mkdir(output,{recursive:true});
  execFileSync('tar',['-czf',path.join(output,'nota-web-source.tar.gz'),'-C',staging,'nota']);
  await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(`Web source archive: local/releases/nota-web-source.tar.gz (${files.length} files)`);
}finally{await rm(staging,{recursive:true,force:true});}
