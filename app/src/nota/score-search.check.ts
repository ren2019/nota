import { ScoreSearchSession, type ScoreSourceTransport } from "./score-search";
import type { SourceCandidate, SourceItem } from "./source-import";
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
function deferred<T>() { let resolve!: (value:T) => void; let reject!: (error:Error) => void; const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; }
const item: SourceItem = {title:"合成旋律",aliases:"",edition:"测试版",url:"https://www.gutenberg.org/test.xml",license:"Test",format:"musicxml"};
const candidate: SourceCandidate = {schema:"nota.score-candidate.v1",title:item.title,text:"<score-partwise/>",format:"musicxml",notes:4,measures:1,sourceCompared:true,scope:"Test",source:{url:item.url,license:"Test",sha256:"a",importedAt:"",validation:"source-compared",method:"Test",scope:"Test",part:"Melody",importedTextHash:"a"}};
const searches = [deferred<SourceItem[]>(),deferred<SourceItem[]>()]; let index=0;
const preparations = [deferred<SourceCandidate>(),deferred<SourceCandidate>()]; let p=0;
const transport: ScoreSourceTransport = {search:()=>searches[index++].promise,prepare:()=>preparations[p++].promise,validate:async()=>candidate};
const session = new ScoreSearchSession(transport);
assert(session.phase === "idle" && session.items.length === 0,"Unsearched page has no sample list");
session.setDraft("old"); const old=session.submit(); session.setDraft("new"); const latest=session.submit();
searches[1].resolve([item]); await latest; searches[0].resolve([{...item,title:"旧结果"}]); await old;
assert(session.query === "new" && session.items[0].title === item.title,"Older query cannot overwrite latest results");
session.select(item); const oldPreparation=session.prepare(); session.select({...item,title:"第二版本"}); const newPreparation=session.prepare();
preparations[1].reject(new Error("真实校验失败")); await newPreparation; preparations[0].resolve(candidate); await oldPreparation;
assert(session.candidate === null && session.error.includes("真实校验失败"),"Old preparation cannot turn a failed new selection into success");
await session.validateFile(new File(["{}"],"candidate.json"));
assert(session.candidate !== null,"Validated external candidate remains supported");
for(const accepted of [false,true]) { const result=await session.adopt(async()=>accepted); assert(result === accepted && session.candidate !== null,"Cancelled or accepted adoption retains browsing state"); }
const waiting = deferred<boolean>(); const adoption = session.adopt(()=>waiting.promise);
session.setDraft("替换中的查询");
assert(session.draft === "new", "Adoption locks browsing until the document replacement gate resolves");
waiting.resolve(false); await adoption;
await session.validateFile(new File(["not json"],"bad.json"));
assert(session.candidate === null && session.phase === "error","Invalid external file clears a previous candidate");
console.log("Score search journey: explicit queries, request ordering, validated candidates and adoption state preserved.");
