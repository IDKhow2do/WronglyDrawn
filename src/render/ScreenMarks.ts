/**
 * [INPUT]: depends on the DOM only (an inline SVG over the canvas, the Web Animations API)
 * [OUTPUT]: exports screenMark(kind, color?) — a red correction mark drawn over the whole screen for ~0.7 s:
 *           'strike' (a ruled line with ticks swipes across: the Ruler Snake's whip) and 'circle' (a marker circle
 *           loops round the middle: the Compass Spinner's closed circle)
 * [POS]: the screen half of a corrector's hit on WAI. Twin of SoundFx.pulse (the BIG SHOUT's screen rings): the
 *        world half is drawn by ctx.effects / ctx.effects.sound, the hurt flash by UI.flashDamage. Callers fire it only
 *        when takeHit() returned true, so it never stacks on a blinking WAI. pointer-events: none; one node per mark.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */

export type ScreenMarkKind = 'strike' | 'circle';

const NS = 'http://www.w3.org/2000/svg';
const RIM = '#fbf6ea'; // paper white under red ink (dark paint gets a light rim, as in SoundFx)

/** A hand-drawn loop: an ellipse round the screen middle that overshoots its start, like a teacher's red circle. */
function circlePath(): string {
  const pts: string[] = [];
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const a = -2.2 + (i / n) * Math.PI * 2.25;
    const wob = 1 + 0.035 * Math.sin(a * 3 + 0.7) + (i / n) * 0.05;
    pts.push(`${(50 + Math.cos(a) * 31 * wob).toFixed(2)},${(54 + Math.sin(a) * 34 * wob).toFixed(2)}`);
  }
  return `M${pts.join(' L')}`;
}

/** A ruled line across the screen, a little tilted, with centimetre ticks hanging off it. */
function strikePath(): string {
  const y0 = 47 + Math.random() * 6, tilt = (Math.random() - 0.5) * 8;
  let d = `M-2,${(y0 - tilt / 2).toFixed(2)} L102,${(y0 + tilt / 2).toFixed(2)}`;
  for (let x = 4; x < 100; x += 6) {
    const y = y0 - tilt / 2 + (tilt * (x + 2)) / 104;
    d += ` M${x},${y.toFixed(2)} l0,${x % 30 === 4 ? 4.5 : 2.4}`;
  }
  return d;
}

export function screenMark(kind: ScreenMarkKind, color = '#e8253a'): void {
  if (typeof document === 'undefined') return;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:40;overflow:visible;';
  const d = kind === 'circle' ? circlePath() : strikePath();
  // two strokes: the paper rim, then the red ink (non-scaling, so the line keeps its weight on any screen)
  for (const [col, w] of [[RIM, kind === 'circle' ? 22 : 18], [color, kind === 'circle' ? 13 : 11]] as [string, number][]) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', col);
    p.setAttribute('stroke-width', String(w));
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    p.setAttribute('pathLength', '1');
    p.style.strokeDasharray = '1 1';
    svg.appendChild(p);
    // drawn on fast (a flick of the pen), held, then lifted off
    p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0, offset: kind === 'circle' ? 0.32 : 0.2 }, { strokeDashoffset: 0 }], { duration: 720, easing: 'ease-out', fill: 'forwards' });
  }
  document.body.appendChild(svg);
  const a = svg.animate([{ opacity: 0.95 }, { opacity: 0.95, offset: 0.55 }, { opacity: 0 }], { duration: 720 });
  a.onfinish = () => svg.remove();
}
