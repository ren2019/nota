// Only bundled by the Node regression runner; no network or speaker output.
export function Soundfont(ctx) {
  return {
    ready: Promise.resolve(),
    stop() {},
    start(options) {
      globalThis.__audioProbe.notes?.push(options.note);
      globalThis.__audioProbe.scheduled++;
      if (
        ctx.state === "running" &&
        navigator.audioSession?.type === "playback"
      )
        globalThis.__audioProbe.audible++;
      return () => {};
    },
  };
}
