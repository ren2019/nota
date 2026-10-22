// Real app media made from an original, lyric-free synthetic exercise.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const root=fileURLToPath(new URL('..',import.meta.url));
const temporary=await mkdtemp(`${tmpdir()}/nota-media-`);process.env.NOTA_LIBRARY_DIRECTORY=temporary;
const server=await createServer({root,configFile:`${root}/vite.config.ts`,cacheDir:`${temporary}/vite`,server:{host:'127.0.0.1',port:5194,strictPort:true,hmr:false}});
let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const source="X:1\nT:Nota · Synthetic exercise\nM:4/4\nL:1/4\nK:1=C\nCmaj7 1 3 2 4 | F#m7 5 3 6 4 | Bb7 2 5 4 7 | C 1' 5 3 1 |]\n";
 for(const [lang,file] of [['zh','screenshot-zh.png'],['en','screenshot-en.png']]){
  await page.goto(`http://127.0.0.1:5194/?lang=${lang}`);await page.locator('#btn-start-sample').click();await page.locator('[data-mode=edit]').click();await page.locator('#nota-open-editor').click();
  await page.locator('.cm-content').click();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.insertText(source);
  await page.waitForFunction(s=>window.__app.getText()===s,source);
  await page.locator('#score-pane').getByText('Nota · Synthetic exercise',{exact:true}).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.evaluate(()=>document.fonts.check('20px "Nota Chord Symbols"')),true);
  await page.screenshot({path:`${root}/docs/${file}`});
  if(lang==='zh'){
   const svg=await page.locator('#score-pane svg').first().screenshot();
   // The OG image is a crop of the actual renderer, never AI-generated score text.
   const logo=await sharp(`${root}/public/nota-192.png`).resize(100,100).png().toBuffer();
   const title=Buffer.from('<svg width="1200" height="180" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="180" fill="white"/><text x="180" y="90" font-family="sans-serif" font-size="52" fill="#17232b">Nota · Score Workbench</text><text x="180" y="140" font-family="sans-serif" font-size="25" fill="#52636b">Edit · Transpose · Practice · Print</text></svg>');
   const score=await sharp(svg).resize({width:1100,height:390,fit:'inside'}).png().toBuffer();
   await sharp({create:{width:1200,height:630,channels:4,background:'#ffffff'}}).composite([{input:title,top:0,left:0},{input:logo,top:40,left:40},{input:score,top:210,left:50}]).png().toFile(`${root}/public/og-image.png`);
  }
 }
 assert.deepEqual(errors,[]);await mkdir(`${root}/../local/qa/release-media`,{recursive:true});await writeFile(`${root}/../local/qa/release-media/media-check.json`,JSON.stringify({source,errors,fontLoaded:true,kind:'real app synthetic score screenshots'},null,2));
 console.log('Synthetic Chinese/English screenshots and OG image generated; font loaded, no page errors.');
}finally{await browser?.close();await server.close();await rm(temporary,{recursive:true,force:true});}
