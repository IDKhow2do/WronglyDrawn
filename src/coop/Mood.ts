/**
 * [INPUT]: depends on CoopPartner (rules.line, event, journal, pip (heal), swagger) from ./Coop
 * [OUTPUT]: exports Mood (rice, dozing, fluster, poked, called fat; snapshot() for observe / the LLM) and RICE_PER_BOWL
 * [POS]: the cosmetic mood layer of the co-op partner (Coop.step runs update()). A poke from WAI is also reported
 *        to Swagger as an annoyance ("the user is REALLY angry now").
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import type { CoopPartner } from './Coop';

/** Rice she gets through between "meals" (a meal = a happy dance + one of her own half-hearts back). */
export const RICE_PER_BOWL = 10;
const DOZE_AFTER = 13; // s of nothing happening before she nods off
const HUNGRY_AFTER = 80; // s without rice before she starts asking

/**
 * 蓝色大肥鱼's moods — the fun, not-powerful layer on top of the partner:
 *
 *  RICE     every paint drop WAI picks up is a grain of rice for her: her tail wags faster and
 *           faster while they keep coming, she comments, and every 10th one she "eats" (a little
 *           dance, and she gets one of her OWN half-hearts back). No rice for a while → she asks.
 *  DOZING   nothing going on for ~13 s → she sits down, hugs her tail and nods off; the moment
 *           WAI moves or trouble starts she jolts awake and pretends she was thinking.
 *  FLUSTER  hit / lost / flinging paint at nothing for a while → she pulls the bowl over her eyes.
 *  POKED    WAI sprays her → puffed cheeks.
 *
 * Purely cosmetic except the half-heart: it never changes WAI's numbers or her paint damage.
 */
export class Mood {
  /** grains collected this session */
  rice = 0;
  /** meals eaten this session */
  bowls = 0;
  asleep = false;
  naps = 0;
  private lastRiceAt = 0;
  private exciteT = 0;
  private hideT = 0;
  private idleT = 0;
  private begAt = HUNGRY_AFTER;
  private pokeCd = 0;
  private missT = 0;
  private lastHits = 0;
  private flusterCd = 0;
  private jolt = 0;
  /** the last time WAI sprayed her, and what she thinks it was about */
  lastPoke: { at: number; why: 'miss' | 'doze' | 'nag' | 'lost' | 'down' | 'cheeky' | 'none' } | null = null;

  constructor(private p: CoopPartner) {}

  get state(): 'dozing' | 'flustered' | 'excited' | 'hungry' | 'ok' {
    if (this.asleep) return 'dozing';
    if (this.hideT > 0) return 'flustered';
    if (this.exciteT > 0) return 'excited';
    if (this.p.time - this.lastRiceAt > HUNGRY_AFTER) return 'hungry';
    return 'ok';
  }

  /** WAI picked up a paint drop. */
  onRice(): void {
    const p = this.p;
    this.rice++;
    this.lastRiceAt = p.time;
    this.begAt = p.time + HUNGRY_AFTER;
    // each grain in a row winds the tail up further
    this.exciteT = Math.min(4.5, Math.max(this.exciteT, 0.6) + 1.3);
    if (this.asleep) this.wake('rice');
    if (this.rice % RICE_PER_BOWL === 0) {
      this.bowls++;
      const pip = p.pip;
      if (pip.down <= 0) {
        pip.cheerT = 1.6;
        pip.heal(1); // her own meal: WAI's heal rule (Difficulty share)
      }
      this.exciteT = 4.5;
      p.journal.count('meals');
      p.event(`my rice bowl is full (${this.rice} grains): I had a meal`);
      p.rules.line('riceFull', undefined, true, 'rice');
    } else if (this.rice === 1) p.rules.line('riceFirst', undefined, true, 'rice');
    else if (this.rice % 4 === 0) p.rules.line('rice', undefined, false, 'rice');
  }

  /** Something embarrassing happened: bowl over the eyes for a moment. */
  fluster(why: 'hurt' | 'miss' | 'lost'): void {
    if (this.flusterCd > 0 || this.p.pip.down > 0) return;
    this.flusterCd = 9;
    this.hideT = why === 'hurt' ? 1.5 : 2.6;
    const tgt = this.p.pip.sprayEnemy?.id;
    if (why === 'miss') this.p.event(`I missed${tgt ? ' the ' + tgt : ''} (flung paint at nothing) and hid under my bowl`, true, { blame: 'miss' });
    else if (why === 'lost') this.p.event('I got stuck / lost and hid under my bowl', true, { blame: 'lost' });
    else this.p.event('I got hit and hid under my bowl', false);
    this.p.rules.line('fluster', why === 'miss' ? 'I missed… lend me the bowl for a second.' : why === 'lost' ? "I wasn't lost. I was taking the scenic route." : undefined, why !== 'hurt', 'hide');
  }

  /** Embarrassed: bowl over the eyes for a moment (goofs; no line, no journal entry). */
  blush(seconds = 1.6): void {
    this.hideT = Math.max(this.hideT, seconds);
  }

  /** WAI's paint landed on her. */
  poke(): void {
    if (this.pokeCd > 0 || this.p.pip.down > 0) return;
    this.pokeCd = 10;
    const p = this.p;
    const j = p.journal;
    j.count('WAI sprayed me');
    // why would he? the last thing I did that he might mind
    const b = this.asleep ? { blame: 'doze' as const, text: 'I dozed off', t: j.now } : j.lastBlame(25);
    const ago = b ? Math.max(0, Math.round(j.now - b.t)) : 0;
    this.lastPoke = { at: p.time, why: b?.blame ?? 'none' };
    const whyText = b?.blame === 'miss' ? 'I missed my shot' : b?.blame === 'nag' ? 'I nagged him about rice' : b?.blame === 'lost' ? 'I got lost / fell behind' : b?.blame === 'down' ? 'I got smudged' : (b?.text ?? '');
    p.event(b ? `WAI sprayed me ${this.asleep ? 'while I was dozing — to wake me up' : `${ago} s after ${whyText} — that is probably why`}` : 'WAI sprayed me (nothing I did just before explains it: teasing, or an accident)', true, { key: true });
    p.swagger.annoyed('poked');
    if (this.asleep) {
      this.wake('poked');
      return;
    }
    const why = b?.blame;
    p.rules.line('poked', why === 'miss' ? 'Is this because I missed? …Fair.' : why === 'nag' ? 'Is this about the rice? I only asked twice!' : why === 'lost' || why === 'down' ? "I know, I know. I'm keeping up now!" : undefined, true, why === 'miss' ? 'caught' : 'angry');
  }

  /** WAI just helped the "Fat Fish" up: she has opinions about that name. */
  calledFat(): void {
    this.p.rules.line('fat', undefined, true, 'angry');
  }

  /** WAI started talking to her: awake at once, no "caught" line (the chat answer follows). */
  wakeQuietly(): void {
    if (!this.asleep) return;
    this.asleep = false;
    this.idleT = 0;
    this.p.pip.requestJump();
    this.p.event('I jolted awake because WAI spoke to me');
  }

  private wake(why: string): void {
    if (!this.asleep) return;
    this.asleep = false;
    this.idleT = 0;
    this.jolt = 0.25;
    this.p.pip.requestJump();
    this.p.event(`I jolted awake (${why}) and pretended I had been thinking`);
    if (why !== 'rice') this.p.rules.line('caught', undefined, true, 'caught');
  }

  update(dt: number, canAct: boolean): void {
    const p = this.p;
    const pip = p.pip;
    const wai = p.s.player;
    this.exciteT = Math.max(0, this.exciteT - dt);
    this.hideT = Math.max(0, this.hideT - dt);
    this.pokeCd = Math.max(0, this.pokeCd - dt);
    this.flusterCd = Math.max(0, this.flusterCd - dt);
    this.jolt = Math.max(0, this.jolt - dt);

    // ── dozing ──
    const o = p.order ?? p.auto;
    const waiSpeed = Math.hypot(wai.vel.x, wai.vel.z);
    const pipSpeed = Math.hypot(pip.vel.x, pip.vel.z);
    const calm = canAct && o.mode === 'follow' && pip.down <= 0 && pip.grounded && !p.s.enemies.some((e) => !e.disposed && e.engaged && p.fightable(e) && e.pos.distanceTo(wai.pos) < 22);
    const near = pip.pos.distanceTo(wai.pos) < 5;
    if (this.asleep) {
      if (!calm) this.wake('trouble');
      else if (waiSpeed > 1.2 || !near) this.wake('WAI moved');
    } else if (calm && near && waiSpeed < 0.4 && pipSpeed < 0.3 && this.hideT <= 0 && this.exciteT <= 0 && p.chatT <= 0 && !p.llm.talking && !p.goofs.active) {
      this.idleT += dt;
      if (this.idleT > DOZE_AFTER) {
        this.asleep = true;
        this.naps++;
        p.journal.count('naps');
        p.event('I dozed off hugging my tail', true, { blame: 'doze' });
        p.rules.line('doze', undefined, true, 'idle');
      }
    } else this.idleT = 0;

    // ── hungry ──
    if (!this.asleep && calm && p.time > this.begAt && !p.bubble.busy) {
      this.begAt = p.time + 70;
      p.event('I asked WAI where the rice is', true, { blame: 'nag' });
      p.rules.line('hungry', undefined, false, this.rice > 0 ? 'angry' : 'idle');
    }

    // ── flinging paint at nothing ──
    const hits = pip.spray.hits;
    if (pip.sprayingNow && hits === this.lastHits) this.missT += dt;
    else this.missT = Math.max(0, this.missT - dt * 2);
    this.lastHits = hits;
    if (this.missT > 3.2) {
      this.missT = 0;
      this.fluster('miss');
    }

    // → the body
    const m = pip.mood;
    m.excited = Math.min(1, this.exciteT / 3);
    m.sleepy = this.asleep ? 1 : 0;
    m.hide = this.hideT > 0 ? 1 : 0;
  }

  /** For observe() and the LLM. */
  snapshot(): { rice: Record<string, number>; mood: string } {
    return {
      rice: { bowl: this.rice, untilNextMeal: RICE_PER_BOWL - (this.rice % RICE_PER_BOWL), meals: this.bowls, hungryFor: Math.round(this.p.time - this.lastRiceAt) },
      mood: this.state,
    };
  }
}
