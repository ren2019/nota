// 按键即发声：谱面上插入或改一个音之后短促地响一下，录入时凭耳朵就能核对。
//
// 与试听（`editor/player.ts`）同一个音色（smplr 的 FluidR3_GM 钢琴），但各开各的 AudioContext：
// 两边都复用本地音色；首次按键才加载。失败后释放上下文，下一次按键可重试。

import { Soundfont } from "smplr";
import { asset } from "../../common/asset";
import { activatePlaybackSession, resumePlaybackContext } from "../../nota/audio-session";
import type { Accidental } from "../../model/doc";
import { jpPitch } from "../../score/jppitch";

const STEP_SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACC_SEMI: Partial<Record<Accidental, number>> = { sharp: 1, flat: -1, "double-sharp": 2, "double-flat": -2 };

/** 唱名 + 八度点 + 面上的升降号 → MIDI 音高（升降号按「相对调号」近似：升一律 +1、降一律 -1）。 */
export function midiOf(degree: number, octave: number, acc: Accidental | null, fifths: number): number {
  const p = jpPitch(degree, octave, fifths);
  return 12 * (p.octave + 1) + STEP_SEMI[p.step]! + p.alter + (acc ? ACC_SEMI[acc] ?? 0 : 0);
}

export class NotePreview {
  private ctx: AudioContext | null = null;
  private inst: ReturnType<typeof Soundfont> | null = null;

  async play(midi: number): Promise<void> {
    activatePlaybackSession();
    try {
      if (!this.ctx || this.ctx.state === "closed") {
        this.ctx = new AudioContext();
        this.inst = Soundfont(this.ctx, { instrumentUrl: asset("redist/soundfont/acoustic_grand_piano-mp3.js") });
      }
      await resumePlaybackContext(this.ctx);
      await this.inst!.ready;
      this.inst!.start({ note: midi, time: this.ctx.currentTime, duration: 0.3, velocity: 90 });
    } catch (e) {
      console.warn("按键发声不可用", e);
      this.inst = null;
      const ctx = this.ctx; this.ctx = null;
      if (ctx?.state !== "closed") void ctx?.close().catch(() => {});
    }
  }
}
