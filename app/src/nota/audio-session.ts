/** iOS Web Audio defaults to an ambient session, which obeys the ringer mute switch.
 * Set this synchronously in the play gesture, before creating/resuming Web Audio.
 * https://bugs.webkit.org/show_bug.cgi?id=237322#c6
 */
export function activatePlaybackSession(): void {
  const nav =
    typeof navigator === "undefined"
      ? undefined
      : (navigator as Navigator & { audioSession?: { type: string } });
  try {
    if (nav?.audioSession) nav.audioSession.type = "playback";
  } catch {
    /* Optional API: ordinary Web Audio still works in other browsers. */
  }
}

export async function resumePlaybackContext(ctx: AudioContext): Promise<void> {
  activatePlaybackSession();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      ctx.resume(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("音频尚未恢复，请回到 Nota 并再次点击播放。")),
          5000,
        );
      }),
    ]);
    if (ctx.state !== "running")
      throw new Error("音频被系统中断，请再次点击播放。");
  } finally {
    clearTimeout(timer);
  }
}
