import {parse123} from '../j123/parse';
import {checkMeasureDurations} from '../model/beatcheck';
const doc=parse123('T:Pickup regression\nM:3/4\nK:1=C\n1_ | 2 3 4 | 5- 0_ |');
doc.songs[0].parts[0].measures[0].implicit=true;
if(checkMeasureDurations(doc,{pickup:()=>false}).length)throw new Error('Declared implicit pickup must exempt matching final short bar, including editor strict mode');
delete doc.songs[0].parts[0].measures[0].implicit;
if(!checkMeasureDurations(doc,{pickup:()=>false}).some(i=>i.measureIndex===0))throw new Error('A new short first bar must remain flagged in strict mode');
console.log('Structured score: explicit pickup and complementary ending work in editor strict mode.');
