import {ScorePlayer} from '../src/editor/player';import{parse123}from'../src/j123/parse';import{playSourceOf}from'../src/model/playsong';
// Observe the actual final output. Keep this instrumentation outside the application bundle.
const output = document.getElementById('state')!;
const taps=new Map<AudioContext,AnalyserNode>();const connect=AudioNode.prototype.connect;
let maxRms=0,everRunning=false,everPlayback=false;
AudioNode.prototype.connect=function(this:AudioNode,destination:AudioNode,...args:number[]) {
 const ctx=this.context as AudioContext;
 if(destination===ctx.destination){let tap=taps.get(ctx);if(!tap){tap=ctx.createAnalyser();tap.fftSize=2048;taps.set(ctx,tap);connect.call(tap,ctx.destination)}return connect.call(this,tap,...args as [])}
 return connect.call(this,destination,...args as []);
} as typeof AudioNode.prototype.connect;
const src=playSourceOf(parse123('T:Audio probe\nM:4/4\nK:1=C\nQ:1/4=60\n1 2 3 4 |'))!;
const player=new ScorePlayer(()=>{},()=>{});let error='';
const action=(id:string,fn:()=>void|Promise<void>)=>{document.getElementById(id)!.onclick=()=>{try{void Promise.resolve(fn()).catch(e=>{error=String(e)})}catch(e){error=String(e)}}};
action('play',()=>player.play(src));action('pause',()=>player.pause());action('resume',()=>player.resume());action('stop',()=>player.stop());
setInterval(()=>{const nav=navigator as Navigator&{audioSession?:{type:string}};const type=nav.audioSession?.type??'API unavailable';if(type==='playback')everPlayback=true;
 for(const[ctx,tap]of taps){if(ctx.state==='running')everRunning=true;const samples=new Float32Array(tap.fftSize);tap.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((s,x)=>s+x*x,0)/samples.length);maxRms=Math.max(maxRms,rms)}
 output.textContent=JSON.stringify({state:player.state,position:Number(player.position.toFixed(2)),audioSession:type,contexts:[...taps.keys()].map(c=>c.state),maxRms:Number(maxRms.toFixed(6)),realNonzeroOutput:maxRms>0.0001,everRunning,everPlayback,error},null,2);
},100);
const disconnect=AudioNode.prototype.disconnect;
AudioNode.prototype.disconnect=function(this:AudioNode,...args:unknown[]) {
 if(args[0]===this.context.destination && taps.has(this.context as AudioContext))args[0]=taps.get(this.context as AudioContext);
 return Reflect.apply(disconnect,this,args);
} as typeof AudioNode.prototype.disconnect;
