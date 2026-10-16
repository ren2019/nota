import { PlaybackController } from "../editor/playback";
import { ScorePlayer } from "../editor/player";
import { parse123 } from "../j123/parse";
import { playSourceOf } from "../model/playsong";
import { activatePlaybackSession } from "./audio-session";
const assert = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
const nav = { audioSession: { type: "ambient" } };
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: nav,
});
const probe = { scheduled: 0, audible: 0, notes: [] as number[] };
Object.assign(globalThis, {
  __audioProbe: probe,
  window: { setInterval: () => 1 },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
  clearInterval: () => {},
});
class FakeAudioContext {
  static last: FakeAudioContext;
  state = "suspended";
  currentTime = 0;
  listener = () => {};
  refuseResume = false;
  constructor() {
    FakeAudioContext.last = this;
  }
  async resume() {
    if (!this.refuseResume) this.state = "running";
  }
  async suspend() {
    this.state = "suspended";
  }
  addEventListener(_type: string, fn: () => void) {
    this.listener = fn;
  }
  interrupt() {
    this.state = "interrupted";
    this.listener();
  }
}
Object.assign(globalThis, { AudioContext: FakeAudioContext });
const doc = parse123("T:Audio regression\nM:4/4\nK:1=C\n1 2 3 4 |");
const player = new ScorePlayer(
  () => {},
  () => {},
);
await player.play(playSourceOf(doc)!);
assert(
  player.state === "playing" && probe.scheduled > 0,
  "must reach real player scheduling path",
);
assert(
  probe.audible > 0,
  "iOS silent-mode policy: notes scheduled and clock running, but audio session remains ambient",
);
player.pause();
await player.resume();
assert(player.state === "playing", "pause/resume works");
FakeAudioContext.last.interrupt();
assert(player.state === "paused", "system interruption pauses the play clock");
await player.resume();
assert(player.state === "playing", "user can resume after interruption");
player.pause();
FakeAudioContext.last.refuseResume = true;
let failed = false;
try {
  await player.resume();
} catch {
  failed = true;
}
assert(
  failed && player.state !== "playing",
  "blocked context cannot report playing or a fake moving clock",
);
player.stop();
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {},
});
activatePlaybackSession();
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    get audioSession() {
      throw new Error("unsupported");
    },
  },
});
activatePlaybackSession();

console.log(
  "Playback: media audio session is configured before sound scheduling; pause/resume preserved.",
);

// 练习控制沿用真实 PlaybackController 与 ScorePlayer；只替代系统采样器。
Object.defineProperty(globalThis, "navigator", {configurable:true,value:nav});
FakeAudioContext.last.refuseResume = false;
let current = playSourceOf(doc)!;
const originalDocument = JSON.stringify(doc);
const controls = new PlaybackController({
  canPlay: true, playable: () => current,
  startPoint: () => ({id: doc.songs[0]!.parts[0]!.measures[0]!.elements[2]!.id!, pass:0}),
  loopPoints: () => null, highlightPlaying: () => {}, setStatus: () => {}, saveSettings: () => {},
});
await controls.play();
assert(controls.state === "playing", "practice starts the real current score");
await controls.toggle();
assert(controls.state === "paused", "practice pause is engine pause");
controls.setSpeed(0.5);
await new Promise(resolve => setTimeout(resolve,0));
assert(controls.state === "paused" && controls.options().speed === 0.5, "speed preserves paused state");
controls.setLoop(true);
assert(controls.loop, "loop uses same engine");
controls.setLoop(false);
controls.rewind();
assert(controls.state === "stopped", "rewind stops instead of autoplaying");
probe.notes.length = 0;
await controls.play();
assert(probe.notes[0] === 60, "rewind starts from first C4 despite prior professional note selection");
controls.stop();
current = playSourceOf(parse123("T:第二份\nM:4/4\nK:1=C\n7' 7' 7' 7' |"))!;
const before = probe.scheduled;
probe.notes.length = 0;
await controls.play();
assert(controls.state === "playing" && probe.scheduled > before, "switching score schedules the new source");
assert(probe.notes.length > 0 && probe.notes.every(note => note === 83), "only current high B melody reaches sampler after replacement");
controls.stop();
assert(controls.state === "stopped", "leaving practice stops playback");
assert(JSON.stringify(doc) === originalDocument, "playback does not mutate original music or lyrics");
console.log("Practice controls: real player pause/speed/loop/rewind and source replacement passed.");
