/**
 * [INPUT]: depends on the Web Audio graph (ctx, music bus, noise buffer) handed over by AudioEngine.attach;
 *          loops listed in public/audio/music/tracks.json (files + licences in CREDITS.md there)
 * [OUTPUT]: exports Music (setMood, setHeat, mood, track, brightness, level) and the MusicMood type
 * [POS]: the only music player. Sessions report a mood, main.ts hands it over every frame, Music crossfades.
 *        Recorded CC0 loops per mood, crossfaded as the mood changes; each level can have its own explore loop.
 *        Until a loop has loaded (or if a file is missing) the generative synth below plays instead.
 *        Boss moods: 'boss_final' → boss.mp3 → combat.mp3. A stand-in loop (not the mood's own file) plays
 *        heavier: slowed, under a low-pass that sweeps open at the intro and opens further with the fight's
 *        heat (setHeat), with a synth overlay locked to its beat (rumble, slow thud, an exam-clock tick).
 *        Only names in tracks.json are fetched: a missing boss file costs no request and no console error.
 *        Docs: docs/audio/BOSS_MUSIC.md (shortlist, how to add a boss track).
 * [PROTOCOL]: Update this header on change, then check docs/audio/BOSS_MUSIC.md
 *
 * Generative, layered music. A 16-step sequencer (look-ahead scheduling)
 * plays a quirky D-dorian groove with synthesised instruments.
 * Layers fade in/out by mood so the soundtrack follows the action.
 */
export type MusicMood = 'off' | 'title' | 'explore' | 'danger' | 'combat' | 'boss' | 'boss_final' | 'victory';

type Layer = 'marimba' | 'bass' | 'hats' | 'kick' | 'snare' | 'dist' | 'melody' | 'pad' | Overlay;
/** Boss overlay layers: they play on top of a stand-in loop (their own bus, never muted by a recording). */
type Overlay = 'thud' | 'tick' | 'rumble';
const OVERLAYS: readonly Overlay[] = ['thud', 'tick', 'rumble'];

const MOOD_LAYERS: Record<MusicMood, Partial<Record<Layer, number>>> = {
  off: {},
  title: { pad: 0.8, marimba: 0.5 },
  explore: { marimba: 0.9, bass: 0.8, hats: 0.5, pad: 0.35 },
  danger: { bass: 0.9, kick: 0.7, hats: 0.35, pad: 0.5 },
  combat: { marimba: 0.6, bass: 0.6, kick: 1, snare: 0.9, hats: 0.8, dist: 0.8 },
  // synth-only boss (no loop at all): no marimba, more bass and grit
  boss: { bass: 1, kick: 0.9, snare: 0.6, hats: 0.45, dist: 1, pad: 0.55 },
  boss_final: { bass: 1, kick: 1, snare: 0.8, hats: 0.6, dist: 1, pad: 0.7 },
  victory: { marimba: 1, bass: 0.8, hats: 0.6, melody: 1, pad: 0.6, kick: 0.6 },
};

/** Loops fetched when tracks.json can't be read (the files shipped before boss music). */
const CORE_LOOPS = ['title', 'explore', 'explore_harbor', 'danger', 'combat'];
/** Boss moods fall back along these chains to the first loop that has loaded. */
const BOSS_CHAIN: Partial<Record<MusicMood, string[]>> = { boss: ['boss', 'combat'], boss_final: ['boss_final', 'boss', 'combat'] };
/** Beats in one pass of a loop (measured: combat.mp3 = 16 bars at ≈155 bpm). Known → the overlay locks to its beat. */
const LOOP_BEATS: Record<string, number> = { combat: 64 };
/** A stand-in played this much slower (and lower): combat.mp3 at 0.9 ≈ 140 bpm, 1.8 semitones down. */
const STAND_IN_RATE: Record<string, number> = { combat: 0.9 };
/** Low-pass of a stand-in: cutoff at heat 0, octaves it opens by heat 1, and the intro sweep. */
const BOSS_CUT = { boss: 1400, boss_final: 900, octaves: 2.6, sweepFrom: 220, sweepSec: 3.5 };
const isBoss = (m: MusicMood): m is 'boss' | 'boss_final' => m === 'boss' || m === 'boss_final';

// D dorian progression: Dm7 · G7 · Cmaj7 · Am7 (one chord per bar)
const CHORDS = [
  [62, 65, 69, 72],
  [55, 59, 62, 65],
  [60, 64, 67, 71],
  [57, 60, 64, 67],
];
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private noise!: AudioBuffer;
  private layerGain = new Map<Layer, GainNode>();
  private timer = 0;
  private step = 0;
  private nextTime = 0;
  private bpm = 100;
  mood: MusicMood = 'off';
  /** 0..3 woken faces: adds melody density. */
  brightness = 0;
  private seed = 7;

  // ── recorded loops ──
  private tracks = new Map<string, AudioBuffer>();
  /** Keyed by track name, or `name@mood` for a boss stand-in (same file, its own slowed + filtered voice). */
  private playing = new Map<string, { src: AudioBufferSourceNode; gain: GainNode; filter?: BiquadFilterNode; sweepEnd?: number }>();
  private synthBus!: GainNode;
  /** The music bus itself (recorded loops skip the synth's echo). */
  private bus!: GainNode;
  /** Level whose own explore loop (explore_<level>) is preferred. */
  level = 'plaza';

  // ── boss ──
  /** 0 … 1: how far the boss fight has come (main.ts sets it every frame via setHeat). */
  private heat = 0;
  private heatApplied = -1;
  /** The beat grid of the playing stand-in loop: the synth sequencer locks to it while it is set. */
  private clock: { t0: number; beat: number } | null = null;

  private async loadTracks(): Promise<void> {
    const ctx = this.ctx!;
    const base = `${import.meta.env.BASE_URL}audio/music/`;
    let names = CORE_LOOPS;
    try {
      const r = await fetch(`${base}tracks.json`);
      if (r.ok) names = ((await r.json()) as { loops: string[] }).loops;
    } catch {
      /* the shipped five */
    }
    await Promise.all(
      names.map(async (n) => {
        try {
          const r = await fetch(`${base}${n}.mp3`);
          if (!r.ok) return;
          this.tracks.set(n, await ctx.decodeAudioData(await r.arrayBuffer()));
          // a loop that arrives while its mood is on (or a better boss loop) takes over
          if (this.trackFor(this.mood) === n) {
            this.applyTracks(1.5);
            this.applyLayers(1.5);
          }
        } catch {
          /* synth fallback */
        }
      }),
    );
  }

  private trackFor(m: MusicMood): string | null {
    if (m === 'off') return null;
    const chain = BOSS_CHAIN[m];
    if (chain) return chain.find((n) => this.tracks.has(n)) ?? null;
    // Limp Works (level 3): no loop of its own — the factory hums to the 'Insistent' loop, slowed (see applyTracks)
    if (this.level === 'works' && m === 'explore' && this.tracks.has('danger')) return 'danger';
    const want = m === 'explore' || m === 'victory' ? (this.tracks.has(`explore_${this.level}`) ? `explore_${this.level}` : 'explore') : m;
    return this.tracks.has(want) ? want : null;
  }

  /** What plays now: a loop name, `name@mood` for a boss stand-in, 'synth', or null when off (tests, dev panel). */
  get track(): string | null {
    if (this.mood === 'off') return null;
    const t = this.trackFor(this.mood);
    if (!t) return 'synth';
    return isBoss(this.mood) && t !== this.mood ? `${t}@${this.mood}` : t;
  }

  /** Low-pass cutoff of a boss stand-in at the current heat. */
  private bossCut(): number {
    const base = this.mood === 'boss_final' ? BOSS_CUT.boss_final : BOSS_CUT.boss;
    return base * Math.pow(2, this.heat * BOSS_CUT.octaves);
  }

  /** Fade the current mood's loop in and every other loop out; the synth plays only when no loop exists. */
  private applyTracks(fade: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const want = this.trackFor(this.mood);
    const key = this.track;
    for (const [name, p] of this.playing) {
      if (name === key) continue;
      p.gain.gain.cancelScheduledValues(t);
      p.gain.gain.setValueAtTime(p.gain.gain.value, t);
      p.gain.gain.linearRampToValueAtTime(0, t + fade);
      p.src.stop(t + fade + 0.05);
      this.playing.delete(name);
    }
    if (!key || !key.includes('@')) this.clock = null;
    if (want && key && !this.playing.has(key)) {
      const buf = this.tracks.get(want)!;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      if (this.level === 'works' && want === 'danger') src.playbackRate.value = this.mood === 'explore' ? 0.86 : 1;
      // skip the MP3 encoder padding at both ends so the loop seam stays tight
      src.loopStart = Math.min(0.03, buf.duration * 0.01);
      src.loopEnd = Math.max(src.loopStart + 0.1, buf.duration - 0.03);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(this.mood === 'title' ? 0.75 : 0.9, t + fade);
      const entry: { src: AudioBufferSourceNode; gain: GainNode; filter?: BiquadFilterNode; sweepEnd?: number } = { src, gain };
      if (key.includes('@')) {
        // a boss stand-in: slower and lower, under a low-pass that sweeps open as the boss arrives
        const rate = STAND_IN_RATE[want] ?? 1;
        src.playbackRate.value = rate;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.Q.value = 1.1;
        f.frequency.setValueAtTime(BOSS_CUT.sweepFrom, t);
        f.frequency.exponentialRampToValueAtTime(this.bossCut(), t + BOSS_CUT.sweepSec);
        src.connect(f).connect(gain);
        entry.filter = f;
        entry.sweepEnd = t + BOSS_CUT.sweepSec;
        this.heatApplied = this.heat;
        // the synth sequencer locks to the loop's beat (buffer time 0 = the downbeat)
        const beats = LOOP_BEATS[want];
        this.clock = beats ? { t0: t - src.loopStart / rate, beat: (src.loopEnd - src.loopStart) / rate / beats } : null;
        if (this.clock) this.rephase();
      } else src.connect(gain);
      gain.connect(this.bus);
      src.start(t, src.loopStart);
      this.playing.set(key, entry);
    }
    this.synthBus.gain.cancelScheduledValues(t);
    this.synthBus.gain.setValueAtTime(this.synthBus.gain.value, t);
    this.synthBus.gain.linearRampToValueAtTime(want || this.mood === 'off' ? 0 : 1, t + fade);
  }

  /** Move the sequencer onto the stand-in loop's beat grid (next 16th after now). */
  private rephase(): void {
    const c = this.clock!;
    const sd = c.beat / 4;
    const k = Math.ceil((this.ctx!.currentTime + 0.05 - c.t0) / sd);
    this.nextTime = c.t0 + k * sd;
    this.step = ((k % 64) + 64) % 64;
  }

  /** Overlay gains for a boss mood played by a stand-in (or the synth): rumble always, thud + tick on a beat grid. */
  private overlay(): Partial<Record<Overlay, number>> {
    if (!isBoss(this.mood)) return {};
    const want = this.trackFor(this.mood);
    if (want === this.mood) return {}; // its own recording: nothing on top
    const fin = this.mood === 'boss_final';
    const grid = !want || !!this.clock; // rhythm only where it can lock to the beat
    const h = this.heat;
    return {
      rumble: (fin ? 0.8 : 0.55) + 0.3 * h,
      thud: grid ? (fin ? 1 : 0.85) : 0,
      // the exam clock starts ticking a third of the way in (from the start in the final)
      tick: grid && (fin || h >= 0.33) ? (fin ? 0.7 : 0.55) : 0,
    };
  }

  /** Fade every layer to the mood's level (+ the boss overlay). */
  private applyLayers(fade: number): void {
    const t = this.ctx!.currentTime;
    const target: Partial<Record<Layer, number>> = { ...MOOD_LAYERS[this.mood], ...this.overlay() };
    for (const [l, g] of this.layerGain) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(target[l] ?? 0, t + fade);
    }
  }

  /**
   * 0 … 1: how far the boss fight has come (phase gates sit on it). A stand-in's low-pass opens and the overlay
   * thickens with it. Cheap to call every frame: it acts only on a change of 0.02 or more, never inside the intro sweep.
   */
  setHeat(h: number): void {
    this.heat = Math.min(1, Math.max(0, h));
    if (!this.ctx || !isBoss(this.mood) || Math.abs(this.heat - this.heatApplied) < 0.02) return;
    const p = this.track ? this.playing.get(this.track) : undefined;
    const t = this.ctx.currentTime;
    if (p?.filter) {
      if (p.sweepEnd !== undefined && t < p.sweepEnd) return;
      p.filter.frequency.cancelScheduledValues(t);
      p.filter.frequency.setValueAtTime(p.filter.frequency.value, t);
      p.filter.frequency.setTargetAtTime(this.bossCut(), t, 0.6);
    }
    this.heatApplied = this.heat;
    this.applyLayers(0.8);
  }

  attach(ctx: AudioContext, out: GainNode, noise: AudioBuffer): void {
    this.ctx = ctx;
    this.bus = out;
    this.noise = noise;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    // gentle "room": short feedback delay
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.18;
    const fb = ctx.createGain();
    fb.gain.value = 0.22;
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    this.out.connect(out);
    this.out.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(out);
    this.synthBus = ctx.createGain();
    this.synthBus.connect(this.out);
    for (const l of ['marimba', 'bass', 'hats', 'kick', 'snare', 'dist', 'melody', 'pad'] as Layer[]) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.synthBus);
      this.layerGain.set(l, g);
    }
    // boss overlay: its own bus, so it plays on top of a recorded stand-in loop
    const overBus = ctx.createGain();
    overBus.connect(this.out);
    for (const l of OVERLAYS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(overBus);
      this.layerGain.set(l, g);
    }
    // the rumble: endless low noise, silent until a boss mood opens its layer
    const rumble = ctx.createBufferSource();
    rumble.buffer = noise;
    rumble.loop = true;
    const rl = ctx.createBiquadFilter();
    rl.type = 'lowpass';
    rl.frequency.value = 95;
    rl.Q.value = 0.7;
    const rg = ctx.createGain();
    rg.gain.value = 0.55;
    rumble.connect(rl).connect(rg).connect(this.layerGain.get('rumble')!);
    rumble.start();
    void this.loadTracks();
  }

  setMood(m: MusicMood): void {
    if (!this.ctx || m === this.mood) return;
    this.mood = m;
    const fast = m === 'combat' || isBoss(m);
    this.bpm = m === 'combat' ? 116 : m === 'boss_final' ? 104 : m === 'boss' ? 96 : m === 'danger' ? 104 : 100;
    this.heatApplied = this.heat;
    this.applyTracks(fast ? 0.6 : 1.6);
    this.applyLayers(fast ? 0.6 : 1.6);
    if (m !== 'off' && !this.timer) {
      this.nextTime = this.ctx.currentTime + 0.1;
      if (this.clock) this.rephase();
      this.timer = window.setInterval(() => this.schedule(), 25);
    }
  }

  stop(): void {
    this.setMood('off');
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // locked to a boss stand-in loop's beat while one plays, else the synth's own tempo
    const stepDur = this.clock ? this.clock.beat / 4 : 60 / this.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, t: number, sd: number): void {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = CHORDS[bar % 4];
    // marimba: syncopated arpeggio, deterministic per bar so it feels composed
    const pattern = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1];
    if (pattern[s]) {
      const idx = (s * 3 + bar) % chord.length;
      const oct = s % 8 === 6 ? 12 : 0;
      this.marimba(mtof(chord[idx] + oct), t);
    }
    // bass on 1, the "and" of 2, and 3
    if (s === 0 || s === 6 || s === 8 || (s === 14 && bar % 2 === 1)) this.bass(mtof(chord[0] - 24 + (s === 14 ? 7 : 0)), t, sd * (s === 0 ? 3 : 2));
    if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.7 : 0.4);
    if (s === 0 || s === 8 || (s === 10 && bar % 2)) this.kick(t);
    if (s === 4 || s === 12) this.snare(t);
    if (s % 4 === 0) this.dist(mtof(chord[0] - 12), t, sd * 3);
    if (s === 0) this.pad(chord, t, sd * 16);
    // melody: sparse bells, denser as the plaza wakes up
    const density = 0.18 + this.brightness * 0.12;
    if (s % 2 === 0 && this.rand() < density) this.melody(mtof(chord[Math.floor(this.rand() * 4)] + 12), t);
    // boss overlay (silent unless a boss mood opened its layers): a slow heavy thud on 1 and 3, every beat
    // from two thirds in; the exam clock ticks on every beat (eighths late in the final)
    if (isBoss(this.mood)) {
      const fin = this.mood === 'boss_final';
      const driven = this.heat >= 0.66;
      if (s === 0 || s === 8 || (driven && s % 4 === 0) || (fin && s === 14 && bar % 2 === 1)) this.thud(t, s === 0 ? 1 : 0.75);
      if (s % 4 === 0 || (fin && driven && s % 2 === 0)) this.tick(t, s % 8 === 0, s % 4 === 0 ? 1 : 0.5);
    }
  }

  private env(g: GainNode, t: number, peak: number, dur: number, attack = 0.005): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private osc(type: OscillatorType, f: number, t: number, dur: number, peak: number, layer: Layer, attack = 0.005): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    this.env(g, t, peak, dur, attack);
    o.connect(g).connect(this.layerGain.get(layer)!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private marimba(f: number, t: number): void {
    this.osc('sine', f, t, 0.35, 0.16, 'marimba');
    this.osc('sine', f * 4, t, 0.06, 0.05, 'marimba');
    this.osc('triangle', f * 2, t, 0.12, 0.04, 'marimba');
  }

  private bass(f: number, t: number, dur: number): void {
    this.osc('triangle', f, t, dur, 0.32, 'bass', 0.01);
    this.osc('sine', f / 2, t, dur, 0.22, 'bass', 0.01);
  }

  private melody(f: number, t: number): void {
    this.osc('sine', f, t, 0.9, 0.1, 'melody');
    this.osc('sine', f * 2.76, t, 0.3, 0.03, 'melody');
  }

  private pad(chord: number[], t: number, dur: number): void {
    for (const m of chord) {
      this.osc('sawtooth', mtof(m - 12), t, dur, 0.018, 'pad', 0.5);
      this.osc('sine', mtof(m), t, dur, 0.03, 'pad', 0.6);
    }
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    this.env(g, t, 0.5, 0.22);
    o.connect(g).connect(this.layerGain.get('kick')!);
    o.start(t);
    o.stop(t + 0.25);
  }

  /** Slow heavy kick: a long sub sweep with a dull felt-beater click. */
  private thud(t: number, v: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.32);
    const g = ctx.createGain();
    this.env(g, t, 0.55 * v, 0.6, 0.004);
    o.connect(g).connect(this.layerGain.get('thud')!);
    o.start(t);
    o.stop(t + 0.65);
    this.noiseHit(t, 'lowpass', 380, 0.07, 0.16 * v, 'thud');
  }

  /** The exam clock: a dry wooden tick (higher) / tock (lower). */
  private tick(t: number, tock: boolean, v: number): void {
    this.noiseHit(t, 'bandpass', tock ? 2400 : 3400, 0.025, 0.09 * v, 'tick');
    this.osc('square', tock ? 1180 : 1560, t, 0.018, 0.018 * v, 'tick', 0.001);
  }

  private noiseHit(t: number, filter: BiquadFilterType, f: number, dur: number, peak: number, layer: Layer): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const fl = ctx.createBiquadFilter();
    fl.type = filter;
    fl.frequency.value = f;
    const g = ctx.createGain();
    this.env(g, t, peak, dur);
    src.connect(fl).connect(g).connect(this.layerGain.get(layer)!);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  private hat(t: number, v: number): void {
    this.noiseHit(t, 'highpass', 7000, 0.04, 0.12 * v, 'hats');
  }

  private snare(t: number): void {
    this.noiseHit(t, 'bandpass', 1800, 0.16, 0.28, 'snare');
    this.osc('triangle', 190, t, 0.08, 0.12, 'snare');
  }

  private dist(f: number, t: number, dur: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const sh = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = Math.tanh(x * 4);
    }
    sh.curve = curve;
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = 900;
    const g = ctx.createGain();
    this.env(g, t, 0.08, dur, 0.01);
    o.connect(sh).connect(fl).connect(g).connect(this.layerGain.get('dist')!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}
