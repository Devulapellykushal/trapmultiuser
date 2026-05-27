/** Short Web Audio one-shots for landing interactions (independent of ambient drone). */

function withCtx(setup) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ctx = new AC();
  const now = ctx.currentTime;
  try {
    setup(ctx, now);
  } catch {
    try {
      ctx.close();
    } catch {
      /* */
    }
    return;
  }
  void ctx.resume().catch(() => {});
  window.setTimeout(() => {
    try {
      ctx.close();
    } catch {
      /* */
    }
  }, 900);
}

/** Soft ticks at 25% / 50% / 75% of hold (only when ambient toggle is on). */
export function playHoldMilestoneTick() {
  withCtx((ctx, now) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 1320;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.035, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    o.stop(now + 0.07);
  });
}

/** Short major triad when the 1s hold completes and sections unlock. */
export function playUnlockChime() {
  withCtx((ctx, now) => {
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.11, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);
    master.connect(ctx.destination);

    const freqs = [523.25, 659.25, 783.99];
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = 0.34;
      o.connect(og);
      og.connect(master);
      const t0 = now + i * 0.065;
      o.start(t0);
      o.stop(t0 + 0.22);
    });
  });
}
