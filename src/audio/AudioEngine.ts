import * as THREE from 'three';
import { SFX, type SfxName, type SfxCtx } from './Sfx';
import { Music, type MusicMood } from './Music';

export interface PlayOpts {
  /** World position for distance attenuation + stereo pan. */
  pos?: THREE.Vector3;
  vol?: number;
  /** Pitch multiplier (1 = recipe default). Random ±6 % is always added. */
  pitch?: number;
  /** Disable random pitch variation. */
  exact?: boolean;
}

interface SampleSet {
  buffers: AudioBuffer[];
  vol: number;
  /** also play the synth recipe (quieter) on top: keeps the cartoon character */
  layer: boolean;
  last: number;
}

/**
 * WebAudio engine. Recorded CC0 samples (public/audio/sfx, see CREDITS.md there) play where a
 * sound has them — a random variation each time — and every other sound is synthesised at play
 * time; the synth is also the fallback while samples load or if a file is missing. Buses: master → sfx / music. Positional sounds use simple
 * distance falloff + stereo panning relative to the camera.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  readonly music = new Music();
  private listenerPos = new THREE.Vector3();
  private listenerRight = new THREE.Vector3(1, 0, 0);
  private lastPlayed = new Map<SfxName, number>();
  volumes = { master: 0.8, music: 0.55, sfx: 0.9 };
  private loops = new Map<string, { stop: () => void; gain: GainNode }>();
  private samples = new Map<string, SampleSet>();

  /** Fetch + decode the recorded samples (after the context exists). Missing files just stay synth. */
  private async loadSamples(): Promise<void> {
    const ctx = this.ctx!;
    const base = `${import.meta.env.BASE_URL}audio/sfx/`;
    try {
      const man = (await (await fetch(`${base}manifest.json`)).json()) as Record<string, { files: string[]; vol: number; layer: boolean }>;
      await Promise.all(
        Object.entries(man).map(async ([name, e]) => {
          const bufs = await Promise.all(
            e.files.map(async (f) => {
              try {
                return await ctx.decodeAudioData(await (await fetch(base + f)).arrayBuffer());
              } catch {
                return null;
              }
            }),
          );
          const ok = bufs.filter((b): b is AudioBuffer => !!b);
          if (ok.length) this.samples.set(name, { buffers: ok, vol: e.vol, layer: e.layer, last: -1 });
        }),
      );
    } catch (err) {
      console.warn('[audio] samples unavailable, using synth', err);
    }
  }

  /** Must be called from a user gesture (Start button). */
  init(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master.connect(comp).connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    // 2 s of white noise shared by every noisy recipe
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.music.attach(this.ctx, this.musicBus, this.noise);
    void this.loadSamples();
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfxBus.gain.value = this.volumes.sfx;
    this.musicBus.gain.value = this.volumes.music;
  }

  setListener(pos: THREE.Vector3, right: THREE.Vector3): void {
    this.listenerPos.copy(pos);
    this.listenerRight.copy(right).setY(0).normalize();
  }

  /** Fire-and-forget sound effect. */
  play(name: SfxName, opts: PlayOpts = {}): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    // tiny rate limit so 20 hits in one frame don't stack into a roar
    const last = this.lastPlayed.get(name) ?? -1;
    if (now - last < 0.025) return;
    this.lastPlayed.set(name, now);

    let vol = opts.vol ?? 1;
    let pan = 0;
    if (opts.pos) {
      const to = opts.pos.clone().sub(this.listenerPos);
      const d = to.length();
      vol *= 1 / (1 + Math.max(0, d - 2) / 7);
      if (vol < 0.02) return;
      if (d > 0.01) pan = THREE.MathUtils.clamp(to.normalize().dot(this.listenerRight), -1, 1) * 0.8;
    }
    const out = ctx.createGain();
    out.gain.value = vol;
    let node: AudioNode = out;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      out.connect(p);
      node = p;
    }
    node.connect(this.sfxBus);
    const pitch = (opts.pitch ?? 1) * (opts.exact ? 1 : 1 + (Math.random() - 0.5) * 0.12);
    let dur = 0;
    const set = this.samples.get(name);
    if (set) {
      // a random variation, never the same one twice in a row
      let i = Math.floor(Math.random() * set.buffers.length);
      if (set.buffers.length > 1 && i === set.last) i = (i + 1) % set.buffers.length;
      set.last = i;
      const src = ctx.createBufferSource();
      src.buffer = set.buffers[i];
      src.playbackRate.value = pitch;
      const g = ctx.createGain();
      g.gain.value = set.vol;
      src.connect(g).connect(out);
      src.start(now + 0.005);
      src.onended = () => g.disconnect();
      dur = set.buffers[i].duration / pitch;
    }
    if (!set || set.layer) {
      const synthOut: AudioNode = set ? ctx.createGain() : out;
      if (set) {
        (synthOut as GainNode).gain.value = 0.55;
        synthOut.connect(out);
      }
      const sctx: SfxCtx = { ctx, out: synthOut, t: now + 0.005, p: pitch, noise: this.noise };
      dur = Math.max(dur, SFX[name](sctx));
    }
    // disconnect after the sound ends
    setTimeout(() => {
      out.disconnect();
      if (node !== out) node.disconnect();
    }, (dur + 0.3) * 1000);
  }

  /** Start/stop a sustained loop (e.g. purify hum, ink beam). Idempotent per id. */
  loop(id: string, on: boolean, kind: 'purify' | 'beam' | 'charge' | 'spray', vol = 1): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const cur = this.loops.get(id);
    if (on && !cur) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.08);
      g.connect(this.sfxBus);
      const stop = makeLoop(ctx, g, kind, this.noise);
      this.loops.set(id, { stop, gain: g });
    } else if (!on && cur) {
      const t = ctx.currentTime;
      cur.gain.gain.cancelScheduledValues(t);
      cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
      cur.gain.gain.linearRampToValueAtTime(0, t + 0.12);
      setTimeout(() => {
        cur.stop();
        cur.gain.disconnect();
      }, 200);
      this.loops.delete(id);
    }
  }

  setLoopVolume(id: string, vol: number): void {
    const cur = this.loops.get(id);
    if (cur && this.ctx) cur.gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.05);
  }

  stopAllLoops(): void {
    for (const id of [...this.loops.keys()]) this.loop(id, false, 'purify');
  }

  setMood(m: MusicMood): void {
    this.music.setMood(m);
  }

  /** Briefly duck the music under a big stinger. */
  duck(amount = 0.35, time = 0.8): void {
    if (!this.ctx) return;
    const g = this.musicBus.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(this.volumes.music * amount, t);
    g.linearRampToValueAtTime(this.volumes.music, t + time);
  }
}

function makeLoop(ctx: AudioContext, out: GainNode, kind: 'purify' | 'beam' | 'charge' | 'spray', noise: AudioBuffer): () => void {
  const nodes: AudioScheduledSourceNode[] = [];
  if (kind === 'purify') {
    // shimmering chord that slowly rises
    for (const [f, type] of [
      [523.25, 'sine'],
      [659.25, 'triangle'],
      [783.99, 'sine'],
      [1046.5, 'sine'],
    ] as [number, OscillatorType][]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.frequency.linearRampToValueAtTime(f * 1.5, ctx.currentTime + 1.6);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6 + Math.random() * 3;
      const lg = ctx.createGain();
      lg.gain.value = f * 0.01;
      lfo.connect(lg).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.06;
      o.connect(g).connect(out);
      o.start();
      lfo.start();
      nodes.push(o, lfo);
    }
  } else if (kind === 'spray') {
    // aerosol hiss: bright band-passed noise with a tiny flutter
    const n = ctx.createBufferSource();
    n.buffer = noise;
    n.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 4200;
    f.Q.value = 0.7;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.value = 0.32;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const lg = ctx.createGain();
    lg.gain.value = 0.06;
    lfo.connect(lg).connect(g.gain);
    n.connect(f).connect(hp).connect(g).connect(out);
    // the can's rattle-click at the start
    const click = ctx.createOscillator();
    click.type = 'square';
    click.frequency.value = 1400;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.05, ctx.currentTime);
    cg.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
    click.connect(cg).connect(out);
    n.start();
    lfo.start();
    click.start();
    click.stop(ctx.currentTime + 0.06);
    nodes.push(n, lfo);
  } else if (kind === 'beam') {
    // the ERASE beam: a soft rubber-on-paper rubbing (no buzzing laser) — quiet, scratchy, rhythmic
    const n = ctx.createBufferSource();
    n.buffer = noise;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 0.9;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    const g = ctx.createGain();
    g.gain.value = 0.0;
    // back-and-forth strokes (~6 per second), like rubbing an eraser
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6;
    const lg = ctx.createGain();
    lg.gain.value = 0.05;
    lfo.connect(lg).connect(g.gain);
    const base = ctx.createConstantSource();
    base.offset.value = 0.055;
    base.connect(g.gain);
    n.connect(bp).connect(lp).connect(g).connect(out);
    // a faint squeak riding on the strokes
    const sq = ctx.createOscillator();
    sq.type = 'triangle';
    sq.frequency.value = 1900;
    const sqg = ctx.createGain();
    sqg.gain.value = 0.0;
    const sqlfo = ctx.createOscillator();
    sqlfo.frequency.value = 6;
    const sqlg = ctx.createGain();
    sqlg.gain.value = 0.006;
    sqlfo.connect(sqlg).connect(sqg.gain);
    sq.connect(sqg).connect(out);
    for (const src of [n, lfo, base, sq, sqlfo]) src.start();
    nodes.push(n, lfo, base, sq, sqlfo);
  } else {
    // charge: rising whine
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 200;
    o.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 1.2);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.value = 0.07;
    o.connect(f).connect(g).connect(out);
    o.start();
    nodes.push(o);
  }
  return () => nodes.forEach((n) => {
    try {
      n.stop();
    } catch {
      /* already stopped */
    }
  });
}
