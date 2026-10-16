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
const probe = { scheduled: 0, audible: 0 };
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
