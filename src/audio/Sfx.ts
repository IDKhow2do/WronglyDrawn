/**
 * Procedural sound-effect recipes. Each recipe schedules oscillators / noise
 * into `out` starting at time `t`, scaled by pitch `p`, and returns its
 * duration in seconds. Designed to be cartoony, squelchy and readable.
 */
export interface SfxCtx {
  ctx: AudioContext;
  out: AudioNode;
  t: number;
  p: number;
  noise: AudioBuffer;
}

interface ToneOpts {
  type?: OscillatorType;
  f0: number;
  f1?: number;
  dur: number;
  vol?: number;
  attack?: number;
  delay?: number;
  curve?: 'exp' | 'lin';
  vibrato?: number;
}

function tone(s: SfxCtx, o: ToneOpts): void {
  const { ctx, out } = s;
  const t = s.t + (o.delay ?? 0);
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  const f0 = o.f0 * s.p;
  osc.frequency.setValueAtTime(f0, t);
  if (o.f1 !== undefined) {
    const f1 = Math.max(20, o.f1 * s.p);
    if (o.curve === 'lin') osc.frequency.linearRampToValueAtTime(f1, t + o.dur);
    else osc.frequency.exponentialRampToValueAtTime(f1, t + o.dur);
  }
  if (o.vibrato) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = o.vibrato;
    const lg = ctx.createGain();
    lg.gain.value = f0 * 0.04;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + o.dur + 0.05);
  }
  const g = ctx.createGain();
  const v = o.vol ?? 0.3;
  const a = o.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

interface NoiseOpts {
  filter?: BiquadFilterType;
  f0: number;
  f1?: number;
  q?: number;
  dur: number;
  vol?: number;
  attack?: number;
  delay?: number;
  am?: number; // amplitude modulation rate (rubbing / growl)
}

function noise(s: SfxCtx, o: NoiseOpts): void {
  const { ctx, out } = s;
  const t = s.t + (o.delay ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = s.noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = o.filter ?? 'bandpass';
  f.frequency.setValueAtTime(o.f0 * s.p, t);
  if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1 * s.p), t + o.dur);
  f.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  const v = o.vol ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + (o.attack ?? 0.003));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  let last: AudioNode = g;
  if (o.am) {
    const amg = ctx.createGain();
    amg.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = o.am;
    const lg = ctx.createGain();
    lg.gain.value = 0.5;
    lfo.connect(lg).connect(amg.gain);
    lfo.start(t);
    lfo.stop(t + o.dur + 0.05);
    g.connect(amg);
    last = amg;
  }
  src.connect(f).connect(g);
  last.connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + o.dur + 0.05);
}

const bell = (s: SfxCtx, f: number, delay: number, dur = 0.9, vol = 0.16) => {
  tone(s, { type: 'sine', f0: f, dur, vol, delay });
  tone(s, { type: 'sine', f0: f * 2.76, dur: dur * 0.4, vol: vol * 0.35, delay });
  tone(s, { type: 'triangle', f0: f * 5.4, dur: dur * 0.15, vol: vol * 0.15, delay });
};

export const SFX = {
  // ---------------- weapon ----------------
  shoot(s: SfxCtx) {
    noise(s, { filter: 'bandpass', f0: 3200, f1: 1800, q: 0.8, dur: 0.09, vol: 0.32 });
    tone(s, { type: 'square', f0: 900, f1: 260, dur: 0.05, vol: 0.08 });
    tone(s, { type: 'sine', f0: 180, f1: 90, dur: 0.06, vol: 0.18 });
    return 0.12;
  },
  shootEmpty(s: SfxCtx) {
    noise(s, { filter: 'highpass', f0: 5000, dur: 0.04, vol: 0.12 });
    tone(s, { type: 'square', f0: 220, dur: 0.04, vol: 0.05 });
    return 0.06;
  },
  spit(s: SfxCtx) {
    tone(s, { type: 'sine', f0: 140, f1: 420, dur: 0.12, vol: 0.4 });
    noise(s, { filter: 'lowpass', f0: 1800, f1: 400, dur: 0.18, vol: 0.35 });
    return 0.2;
  },
  splat(s: SfxCtx) {
    noise(s, { filter: 'lowpass', f0: 1400, f1: 200, dur: 0.14, vol: 0.32 });
    tone(s, { type: 'sine', f0: 260, f1: 70, dur: 0.12, vol: 0.22 });
    tone(s, { type: 'sine', f0: 900 + Math.random() * 300, f1: 1400, dur: 0.04, vol: 0.05, delay: 0.05 });
    return 0.18;
  },
  /** Paint slapping onto a creature: wet, fat, slightly rubbery. */
  paintHit(s: SfxCtx) {
    noise(s, { filter: 'lowpass', f0: 2400, f1: 300, dur: 0.1, vol: 0.34, attack: 0.001 });
    tone(s, { type: 'sine', f0: 320 + Math.random() * 60, f1: 90, dur: 0.09, vol: 0.32 });
    tone(s, { type: 'triangle', f0: 1200 + Math.random() * 500, f1: 600, dur: 0.035, vol: 0.06, delay: 0.015 });
    return 0.12;
  },
  /** Tiny wet pat for paint landing on the world (many per second, quiet). */
  patter(s: SfxCtx) {
    noise(s, { filter: 'bandpass', f0: 1800 + Math.random() * 1600, q: 1.2, dur: 0.05, vol: 0.18, attack: 0.001 });
    tone(s, { type: 'sine', f0: 600 + Math.random() * 400, f1: 200, dur: 0.035, vol: 0.06 });
    return 0.06;
  },
  /** Thick glob drops (paint dripping off a monster). */
  drip(s: SfxCtx) {
    tone(s, { type: 'sine', f0: 700 + Math.random() * 300, f1: 1500, dur: 0.06, vol: 0.12 });
    noise(s, { filter: 'lowpass', f0: 1200, f1: 300, dur: 0.06, vol: 0.08 });
    return 0.08;
  },
  hit(s: SfxCtx) {
    tone(s, { type: 'sine', f0: 190, f1: 55, dur: 0.11, vol: 0.45 });
    noise(s, { filter: 'bandpass', f0: 1600, q: 1.5, dur: 0.06, vol: 0.3 });
    noise(s, { filter: 'lowpass', f0: 900, f1: 150, dur: 0.12, vol: 0.25 });
    return 0.14;
  },
  hitWeak(s: SfxCtx) {
    SFX.hit(s);
    tone(s, { type: 'triangle', f0: 1320, dur: 0.18, vol: 0.14 });
    tone(s, { type: 'sine', f0: 1980, dur: 0.12, vol: 0.08, delay: 0.02 });
    return 0.22;
  },
  hitMarker(s: SfxCtx) {
    tone(s, { type: 'square', f0: 2400, dur: 0.025, vol: 0.05 });
    return 0.04;
  },
  stunSting(s: SfxCtx) {
    tone(s, { type: 'sawtooth', f0: 220, f1: 110, dur: 0.5, vol: 0.12 });
    bell(s, 880, 0.0, 0.6, 0.12);
    bell(s, 1174.7, 0.08, 0.6, 0.1);
    bell(s, 1568, 0.16, 0.8, 0.1);
    noise(s, { filter: 'lowpass', f0: 600, f1: 100, dur: 0.5, vol: 0.3 });
    return 0.9;
  },
  // ---------------- player ----------------
  step(s: SfxCtx) {
    noise(s, { filter: 'lowpass', f0: 1100, f1: 400, dur: 0.05, vol: 0.13 });
    tone(s, { type: 'sine', f0: 120, f1: 70, dur: 0.04, vol: 0.08 });
    return 0.06;
  },
  jump(s: SfxCtx) {
    tone(s, { type: 'sine', f0: 280, f1: 620, dur: 0.14, vol: 0.2, vibrato: 18 });
    noise(s, { filter: 'highpass', f0: 2500, dur: 0.06, vol: 0.06 });
    return 0.16;
  },
  bigJump(s: SfxCtx) {
    tone(s, { type: 'sine', f0: 200, f1: 900, dur: 0.24, vol: 0.22, vibrato: 14 });
    tone(s, { type: 'triangle', f0: 400, f1: 1300, dur: 0.2, vol: 0.06 });
    return 0.26;
  },
  land(s: SfxCtx) {
    noise(s, { filter: 'lowpass', f0: 600, f1: 120, dur: 0.1, vol: 0.3 });
    tone(s, { type: 'sine', f0: 110, f1: 50, dur: 0.08, vol: 0.2 });
    return 0.12;
  },
  dodge(s: SfxCtx) {
    noise(s, { filter: 'bandpass', f0: 500, f1: 2600, q: 2, dur: 0.24, vol: 0.28, attack: 0.04 });
    return 0.26;
  },
  hurt(s: SfxCtx) {
    tone(s, { type: 'sawtooth', f0: 520, f1: 160, dur: 0.24, vol: 0.18 });
    tone(s, { type: 'square', f0: 260, f1: 90, dur: 0.18, vol: 0.08 });
    noise(s, { filter: 'lowpass', f0: 2000, f1: 300, dur: 0.15, vol: 0.25 });
    return 0.26;
  },
  smudged(s: SfxCtx) {
    tone(s, { type: 'sawtooth', f0: 400, f1: 60, dur: 0.9, vol: 0.18 });
    noise(s, { filter: 'bandpass', f0: 1500, q: 2, dur: 0.8, vol: 0.2, am: 22 });
    return 1;
  },
  chomp(s: SfxCtx) {
    noise(s, { filter: 'highpass', f0: 2800, dur: 0.03, vol: 0.3 });
    noise(s, { filter: 'highpass', f0: 2400, dur: 0.03, vol: 0.3, delay: 0.09 });
    tone(s, { type: 'sine', f0: 160, f1: 70, dur: 0.08, vol: 0.3, delay: 0.09 });
    noise(s, { filter: 'lowpass', f0: 1200, f1: 300, dur: 0.12, vol: 0.22, delay: 0.1 });
    return 0.25;
  },
  gulp(s: SfxCtx) {
    tone(s, { type: 'sine', f0: 420, f1: 140, dur: 0.16, vol: 0.32 });
    tone(s, { type: 'sine', f0: 600, f1: 900, dur: 0.05, vol: 0.08, delay: 0.14 });
    return 0.22;
  },
  burp(s: SfxCtx) {
    tone(s, { type: 'sawtooth', f0: 95, f1: 70, dur: 0.35, vol: 0.16, vibrato: 30 });
    noise(s, { filter: 'bandpass', f0: 500, q: 3, dur: 0.3, vol: 0.12, am: 28 });
    return 0.4;
  },
  heal(s: SfxCtx) {
    bell(s, 784, 0, 0.4, 0.1);
    bell(s, 1175, 0.06, 0.5, 0.1);
    return 0.6;
  },
  // ---------------- organs ----------------
  peel(s: SfxCtx) {
    noise(s, { filter: 'bandpass', f0: 700, f1: 2400, q: 3, dur: 0.22, vol: 0.28 });
    tone(s, { type: 'sine', f0: 300, f1: 520, dur: 0.18, vol: 0.12, vibrato: 25 });
    return 0.25;
  },
  stick(s: SfxCtx) {
    tone(s, { type: 'sine', f0: 140, f1: 60, dur: 0.12, vol: 0.4 });
    noise(s, { filter: 'bandpass', f0: 1200, f1: 500, q: 2, dur: 0.18, vol: 0.28, delay: 0.02 });
    tone(s, { type: 'sine', f0: 700, f1: 1100, dur: 0.06, vol: 0.06, delay: 0.1 });
    return 0.22;
  },
  throwSticker(s: SfxCtx) {
    noise(s, { filter: 'bandpass', f0: 900, f1: 3000, q: 2, dur: 0.18, vol: 0.16 });
    return 0.2;
  },
  recall(s: SfxCtx) {
    noise(s, { filter: 'bandpass', f0: 3000, f1: 600, q: 2, dur: 0.3, vol: 0.18, attack: 0.2 });
    tone(s, { type: 'sine', f0: 500, f1: 1000, dur: 0.1, vol: 0.18, delay: 0.28 });
    return 0.42;
  },
  purifyDone(s: SfxCtx) {
    [523.25, 659.25, 783.99, 987.77, 1318.5].forEach((f, i) => bell(s, f, i * 0.06, 1.2, 0.12));
    noise(s, { filter: 'highpass', f0: 6000, dur: 0.8, vol: 0.06, attack: 0.1 });
    return 1.5;
  },
  denied(s: SfxCtx) {
    tone(s, { type: 'square', f0: 220, dur: 0.08, vol: 0.06 });
    tone(s, { type: 'square', f0: 165, dur: 0.12, vol: 0.06, delay: 0.1 });
    return 0.25;
  },
  select(s: SfxCtx) {
    tone(s, { type: 'triangle', f0: 880, f1: 1320, dur: 0.06, vol: 0.08 });
    return 0.08;
  },
  // host reactions
  blink(s: SfxCtx) {
    tone(s, { type: 'sine', f0: 1400, f1: 900, dur: 0.05, vol: 0.06 });
    return 0.06;
  },
  shuffle(s: SfxCtx) {
    noise(s, { filter: 'lowpass', f0: 500, dur: 0.12, vol: 0.2 });
    noise(s, { filter: 'lowpass', f0: 450, dur: 0.12, vol: 0.18, delay: 0.18 });
    return 0.32;
  },
  crateStep(s: SfxCtx) {
    noise(s, { filter: 'lowpass', f0: 700, f1: 200, dur: 0.08, vol: 0.22 });
    tone(s, { type: 'sine', f0: 140, f1: 80, dur: 0.06, vol: 0.12 });
    noise(s, { filter: 'bandpass', f0: 2200, q: 6, dur: 0.05, vol: 0.05, delay: 0.02 });
    return 0.1;
  },
  sigh(s: SfxCtx) {
    noise(s, { filter: 'bandpass', f0: 600, f1: 300, q: 2, dur: 0.7, vol: 0.18, attack: 0.15 });
    tone(s, { type: 'sine', f0: 180, f1: 120, dur: 0.6, vol: 0.06, attack: 0.1 });
    return 0.75;
  },
  // ---------------- world ----------------
  reveal(s: SfxCtx) {
    noise(s, { filter: 'highpass', f0: 4000, dur: 0.05, vol: 0.08 });
    noise(s, { filter: 'highpass', f0: 4500, dur: 0.05, vol: 0.07, delay: 0.06 });
    tone(s, { type: 'sine', f0: 1046, dur: 0.25, vol: 0.05, delay: 0.05 });
    return 0.3;
  },
  unreveal(s: SfxCtx) {
    tone(s, { type: 'sine', f0: 900, f1: 500, dur: 0.2, vol: 0.04 });
    noise(s, { filter: 'highpass', f0: 3000, dur: 0.08, vol: 0.04 });
    return 0.22;
  },
  crumble(s: SfxCtx) {
    noise(s, { filter: 'lowpass', f0: 900, f1: 150, dur: 0.5, vol: 0.4 });
    for (let i = 0; i < 5; i++) noise(s, { filter: 'bandpass', f0: 1500 + i * 300, q: 4, dur: 0.05, vol: 0.12, delay: 0.05 + i * 0.07 });
    return 0.55;
  },
  crown(s: SfxCtx) {
    [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => bell(s, f, i * 0.09, 0.9, 0.14));
    tone(s, { type: 'triangle', f0: 392, dur: 0.6, vol: 0.12, delay: 0.27 });
    noise(s, { filter: 'highpass', f0: 7000, dur: 0.9, vol: 0.06, delay: 0.27, attack: 0.05 });
    return 1.3;
  },
  paintDrop(s: SfxCtx) {
    tone(s, { type: 'sine', f0: 700, f1: 1150, dur: 0.08, vol: 0.12 });
    return 0.1;
  },
  checkpoint(s: SfxCtx) {
    noise(s, { filter: 'bandpass', f0: 3000, q: 1, dur: 0.35, vol: 0.18 });
    bell(s, 659, 0.1, 0.6, 0.1);
    bell(s, 988, 0.2, 0.7, 0.1);
    return 0.9;
  },
  wake(s: SfxCtx) {
    // big swell: low chord pad + bells
    for (const f of [146.83, 220, 277.18, 329.63]) {
      tone(s, { type: 'sawtooth', f0: f, dur: 2.2, vol: 0.05, attack: 0.6 });
      tone(s, { type: 'sine', f0: f * 2, dur: 2.2, vol: 0.05, attack: 0.5 });
    }
    [587.33, 880, 1174.66, 1760].forEach((f, i) => bell(s, f, 0.5 + i * 0.12, 1.6, 0.12));
    noise(s, { filter: 'lowpass', f0: 300, f1: 80, dur: 1.2, vol: 0.25 });
    return 2.6;
  },
  gateOpen(s: SfxCtx) {
    noise(s, { filter: 'lowpass', f0: 400, f1: 120, dur: 1.4, vol: 0.4, attack: 0.1 });
    tone(s, { type: 'sine', f0: 70, f1: 45, dur: 1.4, vol: 0.3 });
    return 1.5;
  },
  // ---------------- enemies ----------------
  bigStep(s: SfxCtx) {
    tone(s, { type: 'sine', f0: 75, f1: 38, dur: 0.18, vol: 0.55 });
    noise(s, { filter: 'lowpass', f0: 380, f1: 90, dur: 0.18, vol: 0.4 });
    noise(s, { filter: 'bandpass', f0: 1800, q: 5, dur: 0.04, vol: 0.06 });
    return 0.2;
  },
  roar(s: SfxCtx) {
    const { ctx, out, t, p } = s;
    for (const f of [92, 97, 138]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * p, t);
      o.frequency.linearRampToValueAtTime(f * p * 1.25, t + 0.4);
      o.frequency.linearRampToValueAtTime(f * p * 0.8, t + 1.2);
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.setValueAtTime(300, t);
      fl.frequency.linearRampToValueAtTime(1600, t + 0.35);
      fl.frequency.linearRampToValueAtTime(350, t + 1.2);
      fl.Q.value = 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      o.connect(fl).connect(g).connect(out);
      o.start(t);
      o.stop(t + 1.35);
    }
    noise(s, { filter: 'bandpass', f0: 700, q: 1.5, dur: 1.2, vol: 0.25, am: 34, attack: 0.1 });
    return 1.4;
  },
  telegraph(s: SfxCtx) {
    tone(s, { type: 'square', f0: 300, f1: 760, dur: 0.38, vol: 0.06, curve: 'lin' });
    noise(s, { filter: 'bandpass', f0: 900, q: 3, dur: 0.35, vol: 0.1, am: 40 });
    return 0.4;
  },
  stomp(s: SfxCtx) {
    tone(s, { type: 'sine', f0: 62, f1: 28, dur: 0.6, vol: 0.7 });
    noise(s, { filter: 'lowpass', f0: 500, f1: 60, dur: 0.7, vol: 0.55 });
    noise(s, { filter: 'bandpass', f0: 1200, q: 1, dur: 0.25, vol: 0.2 });
    return 0.75;
  },
  kick(s: SfxCtx) {
    noise(s, { filter: 'bandpass', f0: 700, f1: 2400, q: 2, dur: 0.12, vol: 0.25 });
    tone(s, { type: 'sine', f0: 160, f1: 60, dur: 0.1, vol: 0.3, delay: 0.08 });
    return 0.2;
  },
  crash(s: SfxCtx) {
    noise(s, { filter: 'lowpass', f0: 2500, f1: 150, dur: 0.6, vol: 0.55 });
    tone(s, { type: 'sine', f0: 90, f1: 35, dur: 0.5, vol: 0.5 });
    for (let i = 0; i < 4; i++) noise(s, { filter: 'bandpass', f0: 3000 + i * 500, q: 8, dur: 0.15, vol: 0.06, delay: 0.05 * i });
    return 0.7;
  },
  squeak(s: SfxCtx) {
    tone(s, { type: 'sine', f0: 900, f1: 1500, dur: 0.12, vol: 0.12, vibrato: 35 });
    return 0.14;
  },
  erase(s: SfxCtx) {
    noise(s, { filter: 'bandpass', f0: 1400, q: 2, dur: 0.35, vol: 0.2, am: 18 });
    return 0.36;
  },
  pop(s: SfxCtx) {
    tone(s, { type: 'sine', f0: 600, f1: 140, dur: 0.1, vol: 0.3 });
    noise(s, { filter: 'highpass', f0: 2000, dur: 0.05, vol: 0.15 });
    return 0.12;
  },
  jawSnap(s: SfxCtx) {
    noise(s, { filter: 'highpass', f0: 1800, dur: 0.04, vol: 0.4 });
    tone(s, { type: 'square', f0: 140, f1: 60, dur: 0.08, vol: 0.18 });
    return 0.1;
  },
  blinkBig(s: SfxCtx) {
    noise(s, { filter: 'lowpass', f0: 800, dur: 0.15, vol: 0.25 });
    tone(s, { type: 'sine', f0: 300, f1: 120, dur: 0.15, vol: 0.2 });
    return 0.17;
  },
  // ---------------- ui ----------------
  uiClick(s: SfxCtx) {
    tone(s, { type: 'triangle', f0: 660, f1: 990, dur: 0.07, vol: 0.12 });
    noise(s, { filter: 'highpass', f0: 4000, dur: 0.03, vol: 0.05 });
    return 0.08;
  },
  stickerBurst(s: SfxCtx) {
    for (let i = 0; i < 6; i++) noise(s, { filter: 'bandpass', f0: 1200 + Math.random() * 2500, q: 3, dur: 0.09, vol: 0.14, delay: i * 0.045 });
    tone(s, { type: 'sine', f0: 300, f1: 1200, dur: 0.35, vol: 0.08, delay: 0.05 });
    return 0.5;
  },
  whoosh(s: SfxCtx) {
    noise(s, { filter: 'bandpass', f0: 300, f1: 1800, q: 1.2, dur: 0.9, vol: 0.25, attack: 0.4 });
    return 1;
  },
  // ---------------- combat additions (boss tells, new moves, encore) ----------------
  /** Boss: the dash lane locks — a sharp double click. */
  lockOn(s: SfxCtx) {
    tone(s, { type: 'square', f0: 1320, dur: 0.05, vol: 0.12 });
    tone(s, { type: 'square', f0: 1760, dur: 0.06, vol: 0.12, delay: 0.07 });
    return 0.15;
  },
  /** Boss: winding up the spin — a rising rubbery whirr. */
  spinWind(s: SfxCtx) {
    noise(s, { filter: 'bandpass', f0: 300, f1: 1600, q: 2, dur: 1.25, vol: 0.32, attack: 0.3, am: 14 });
    tone(s, { type: 'sawtooth', f0: 70, f1: 220, dur: 1.25, vol: 0.12, attack: 0.2 });
    return 1.3;
  },
  /** Boss: something heavy falling toward you. */
  fallWhistle(s: SfxCtx) {
    tone(s, { type: 'sine', f0: 1500, f1: 420, dur: 0.45, vol: 0.14, curve: 'lin' });
    return 0.5;
  },
  /** Boss: dazed / dizzy / stuck — cartoon birdies. */
  dizzy(s: SfxCtx) {
    for (let i = 0; i < 4; i++) tone(s, { type: 'triangle', f0: 1700 + (i % 2) * 400, dur: 0.12, vol: 0.08, delay: i * 0.13, vibrato: 30 });
    return 0.6;
  },
  /** Boss: phase change sting. */
  phaseSting(s: SfxCtx) {
    tone(s, { type: 'sawtooth', f0: 110, f1: 55, dur: 0.8, vol: 0.18 });
    tone(s, { type: 'square', f0: 233, f1: 116, dur: 0.6, vol: 0.08, delay: 0.05 });
    return 0.9;
  },
  /** Player: the paint-slam dive. */
  slamDive(s: SfxCtx) {
    tone(s, { type: 'sine', f0: 900, f1: 200, dur: 0.25, vol: 0.18 });
    noise(s, { filter: 'bandpass', f0: 800, f1: 2400, q: 1, dur: 0.25, vol: 0.18 });
    return 0.3;
  },
  /** Player: the paint-slam landing — a wet thump. */
  slamLand(s: SfxCtx) {
    tone(s, { type: 'sine', f0: 140, f1: 40, dur: 0.35, vol: 0.5 });
    noise(s, { filter: 'lowpass', f0: 1600, f1: 150, dur: 0.35, vol: 0.45 });
    return 0.4;
  },
  /** Encore: a rubber stamp thunk (pitch rises with the chain). */
  stampHit(s: SfxCtx) {
    tone(s, { type: 'square', f0: 180, f1: 90, dur: 0.08, vol: 0.22 });
    noise(s, { filter: 'lowpass', f0: 1200, f1: 300, dur: 0.1, vol: 0.35 });
    bell(s, 880, 0.03, 0.35, 0.1);
    return 0.4;
  },
  /** Encore: the decision clock ticking. */
  stampTick(s: SfxCtx) {
    tone(s, { type: 'triangle', f0: 2200, dur: 0.03, vol: 0.06 });
    return 0.05;
  },
  /** Encore: the stamp slips — rubbery squeal + boing. */
  stampSlip(s: SfxCtx) {
    tone(s, { type: 'sawtooth', f0: 600, f1: 1400, dur: 0.18, vol: 0.12, curve: 'lin' });
    tone(s, { type: 'sine', f0: 220, f1: 90, dur: 0.4, vol: 0.3, delay: 0.15, vibrato: 12 });
    return 0.6;
  },
  /** Encore: cash out — a little coin cascade. */
  cashOut(s: SfxCtx) {
    [1047, 1319, 1568, 2093].forEach((f, i) => bell(s, f, i * 0.06, 0.5, 0.11));
    return 0.8;
  },
  /** Encore: FRENZY charged / triggered. */
  frenzy(s: SfxCtx) {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(s, { type: 'square', f0: f, dur: 0.12, vol: 0.07, delay: i * 0.07 }));
    noise(s, { filter: 'highpass', f0: 3000, dur: 0.5, vol: 0.12, delay: 0.3 });
    return 0.9;
  },
  // ---------------- Mute Harbor (level 2): sound is the mechanic ----------------
  /** WAI's SHOUT: a cartoony "HEY!" — buzzy voice through two vowel formants + a breathy edge. */
  shout(s: SfxCtx) {
    tone(s, { type: 'sawtooth', f0: 210, f1: 330, dur: 0.12, vol: 0.16, curve: 'lin' });
    tone(s, { type: 'sawtooth', f0: 330, f1: 250, dur: 0.32, vol: 0.18, delay: 0.1, vibrato: 7 });
    noise(s, { filter: 'bandpass', f0: 900, f1: 700, q: 4, dur: 0.38, vol: 0.32 });
    noise(s, { filter: 'bandpass', f0: 2400, f1: 1900, q: 5, dur: 0.34, vol: 0.2, delay: 0.04 });
    noise(s, { filter: 'highpass', f0: 4500, dur: 0.12, vol: 0.08 });
    return 0.5;
  },
  /** A small hand bell (gates, buoys). */
  smallBell(s: SfxCtx) {
    bell(s, 1318, 0, 1.0, 0.16);
    bell(s, 1318, 0.18, 0.8, 0.1);
    return 1.2;
  },
  /** The clock tower's big bronze bell. */
  bigBell(s: SfxCtx) {
    bell(s, 196, 0, 3.4, 0.32);
    bell(s, 392, 0, 2.4, 0.14);
    tone(s, { type: 'sine', f0: 98, dur: 3.6, vol: 0.18 });
    noise(s, { filter: 'lowpass', f0: 500, f1: 120, dur: 0.3, vol: 0.2 });
    return 3.8;
  },
  /** A tuning fork humming (pure tone with a slow beat). */
  forkHum(s: SfxCtx) {
    tone(s, { type: 'sine', f0: 440, dur: 2.2, vol: 0.14, attack: 0.02 });
    tone(s, { type: 'sine', f0: 443, dur: 2.2, vol: 0.1, attack: 0.02 });
    tone(s, { type: 'triangle', f0: 880, dur: 0.6, vol: 0.04 });
    return 2.3;
  },
  /** The ferry's foghorn: a huge low brassy BWAAAH. */
  foghorn(s: SfxCtx) {
    tone(s, { type: 'sawtooth', f0: 82, f1: 78, dur: 2.6, vol: 0.28, attack: 0.15, vibrato: 3 });
    tone(s, { type: 'square', f0: 123, f1: 117, dur: 2.5, vol: 0.12, attack: 0.2 });
    noise(s, { filter: 'lowpass', f0: 400, f1: 200, dur: 2.4, vol: 0.18, attack: 0.2, am: 5 });
    return 2.8;
  },
  /** A gull's cry (two swoops). */
  gull(s: SfxCtx) {
    tone(s, { type: 'triangle', f0: 1500, f1: 2300, dur: 0.18, vol: 0.08, curve: 'lin' });
    tone(s, { type: 'triangle', f0: 2200, f1: 1300, dur: 0.3, vol: 0.08, delay: 0.17, curve: 'lin' });
    return 0.5;
  },
  /** The Hush muffling: a soft inhaled "shhhh". */
  hush(s: SfxCtx) {
    noise(s, { filter: 'highpass', f0: 2600, f1: 5200, dur: 0.9, vol: 0.18, attack: 0.25 });
    noise(s, { filter: 'lowpass', f0: 300, f1: 90, dur: 0.9, vol: 0.12, attack: 0.3 });
    return 1.0;
  },
  /** The lighthouse sings: a rising choir chord. */
  sing(s: SfxCtx) {
    [262, 330, 392, 523].forEach((f, i) => tone(s, { type: 'triangle', f0: f, f1: f * 1.002, dur: 3.2, vol: 0.09, attack: 0.4, delay: i * 0.25, vibrato: 5 }));
    [1047, 1319].forEach((f, i) => bell(s, f, 1.2 + i * 0.3, 1.6, 0.06));
    return 4;
  },
  /** Level complete fanfare (recorded jingle when loaded; this is the fallback). */
  fanfare(s: SfxCtx) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(s, f, i * 0.12, 1.1, 0.12));
    tone(s, { type: 'triangle', f0: 523.25, dur: 1.2, vol: 0.1, delay: 0.48 });
    return 1.8;
  },
  /** Something unlocked (recorded jingle when loaded; this is the fallback). */
  unlock(s: SfxCtx) {
    [659.25, 987.77, 1318.5].forEach((f, i) => bell(s, f, i * 0.08, 0.8, 0.12));
    return 1.1;
  },
} satisfies Record<string, (s: SfxCtx) => number>;

export type SfxName = keyof typeof SFX;
