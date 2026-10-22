// Copy installed dependency notices into the Web output's public resources.
import { readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const lock=JSON.parse(await readFile(path.join(root,'package-lock.json'),'utf8'));
const destination=path.join(root,'public/licenses/npm');
await rm(destination,{recursive:true,force:true});await mkdir(destination,{recursive:true});
const entries=[];
const supplemental=JSON.parse(await readFile(path.join(root,'public/licenses/supplemental/index.json'),'utf8'));

for(const [location,pkg] of Object.entries(lock.packages)){
  if(!location)continue;
  const directory=path.join(root,location);
  let names;try{names=await readdir(directory);}catch(e){if(e.code==='ENOENT')continue;throw e;}
  const manifest=JSON.parse(await readFile(path.join(directory,'package.json'),'utf8'));
  const key=(manifest.name+'@'+manifest.version).replace(/[^a-zA-Z0-9@._-]/g,'_');
  const files=[];
  for(const name of names.filter(n=>/^(licen[cs]e|copying|notice|authors)([.-]|$)/i.test(n))){
    try{const content=await readFile(path.join(directory,name));await mkdir(path.join(destination,key),{recursive:true});await writeFile(path.join(destination,key,name),content);files.push(`${key}/${name}`);}catch(e){if(e.code!=='EISDIR')throw e;}
  }
  if(!files.length){const extra=supplemental.find(x=>x.package===manifest.name&&x.version===manifest.version);if(extra?.path)files.push(`../supplemental/${extra.path}`);}
  entries.push({name:manifest.name,version:manifest.version,license:pkg.license??manifest.license??'See package notices',development:!!pkg.dev,notices:files});
}
await writeFile(path.join(destination,'index.json'),JSON.stringify(entries,null,2)+'\n');
console.log(`Collected notices for ${entries.length} installed packages (including development tools).`);
