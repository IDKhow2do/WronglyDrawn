// Round 3: time-to-kill, old Gentle vs new Gentle (and new Normal / Hard for reference), in the live game code.
// One ordinary creature (a Stapler, base 220) and one boss (the Eraser, base 2100, phase gates and roars included).
// "spray": a bare Classic Can's sustained body spray, 28.6 paint/s (NOTES: sticker audit), never on a weak point.
// "spray + TAG": the same, plus one TAG every time the creature reels and can be tagged (CombatDirector's bite).
// WAI is kept unhittable; the creature's own brain runs (roars, armour). Game seconds.
// Usage: [ONLY='new Normal,new Hard'] node ttk.mjs   (Vite :5295, Chrome :9395)
import { connect, sleep } from '../bot/l1/lib.mjs';
const c = await connect();
const PORT = process.env.WD_VITE || 5295;
const st = () => c.ev('return window.__WD?.state').catch(() => null);
await c.send('Page.navigate', { url: `http://localhost:${PORT}/?test&difficulty=gentle&level=plaza&style=graffiti` });
for (let i = 0; i < 160 && (await st()) !== 'TITLE'; i++) await sleep(500);
await c.ev("localStorage.setItem('wd.boons','auto'); document.querySelector('.start-btn').click(); return 1");
for (let i = 0; i < 100 && (await st()) !== 'PLAYING'; i++) await sleep(500);
for (let i = 0; i < 160 && (await c.ev("return document.querySelector('.hud')?.classList.contains('hidden')")); i++) await sleep(500);
await c.ev(`const s=__WD.session; s.debugWarp('statue'); s.debugWarp('summit'); return 1`); // (the quarter's Staplers are repainted here: revived per row)
await c.ev(`__WD.advance(1); const s=__WD.session; s.player.teleport(s.eraser.arena.clone().add(new s.player.pos.constructor(0,0.3,5)), Math.PI); return 1`);
for (let i = 0; i < 20 && !(await c.ev('return __WD.session.eraser.awake')); i++) await c.ev('__WD.advance(0.3); return 1');
await c.ev(`const s=__WD.session; if (s.story.locked) s.story.skip(); __WD.app.camera.stopCine(); __WD.advance(3); return 1`);

const VARIANTS = {
  'old Gentle': { paint: 1, bossPaint: 1, tagMul: 1.4 },
  'new Gentle': { paint: 1.3, bossPaint: 1.2, tagMul: 1 },
  'new Normal': { paint: 1.5, bossPaint: 1.35, tagMul: 1 },
  'new Hard': { paint: 1.7, bossPaint: 1.5, tagMul: 0.75 },
};
const rows = [];
for (const [name, v] of Object.entries(VARIANTS).filter(([n]) => !process.env.ONLY || process.env.ONLY.split(',').includes(n))) {
  for (const target of ['stapler', 'eraser']) {
    for (const tag of [false, true]) {
      const r = await c.ev(`
        const D=(await import('/src/meta/Difficulty.ts')); const T=(await import('/src/combat/CombatDirector.ts')).TAG_DMG;
        Object.assign(D.DIFFICULTIES.gentle, ${JSON.stringify(v)});
        const s=__WD.session, p=s.player, V=p.pos.constructor;
        const e = ${target === 'eraser' ? 's.eraser' : "s.enemies.find(x=>x.kind==='stapler' && !x.disposed)"};
        if (!e) return 'no target';
        e.syncToughness(); // pick up the row now (a repainted creature may skip its step)
        e.hp=e.maxHp; e.staggersDone=0; e.staggerT=0; e.tagSpent=false; e.state='IDLE'; e.alerted=true;
        if (e.gates) { e.gates=[0.66,0.33]; e.armorT=0; }
        const maxHp=e.maxHp; let t=0, tags=0, tagDmg=0, done=false;
        const pt=()=>e.pos.clone().setY(e.pos.y+${target === 'eraser' ? 1.2 : 0.6});
        const SPRAY=28.6*0.1;
        // never let it finish (it must stay re-usable): the hit that would repaint it ends the clock instead
        while (t < 400) {
          p.invuln=99; p.hp=6;
          if (${tag} && e.canBeTagged) {
            const b = e.baseHp>=1000 ? T.boss : T.creature; const bite=(e.maxHp*b.share+b.flat)*D.Difficulty.s.tagMul;
            if (bite >= e.hp && (!e.gates || !e.gates.length)) { tags++; tagDmg+=e.hp; done=true; break; }
            const hp0=e.hp; e.applyDamage({amount:bite, point:pt(), dir:new V(0,0,-1), collider:null, kind:'spit', color:'#ffd23a', tag:true});
            e.tagSpent=true; tags++; tagDmg+=hp0-e.hp;
          }
          if (e.hp <= SPRAY && (!e.gates || !e.gates.length) && !e.refilling && !(e.armorT>0)) { t+=0.1; done=true; break; }
          e.applyDamage({amount:SPRAY, point:pt(), dir:new V(0,0,-1), collider:null, kind:'paint', color:'#2a4be0'});
          __WD.advance(0.1); t+=0.1;
        }
        const out={paint:Math.round(maxHp), ttk:done?+t.toFixed(1):'>400', tags, tagShare:+(100*tagDmg/maxHp).toFixed(0)};
        e.hp=e.maxHp; e.state='IDLE'; if (e.gates) e.gates=[0.66,0.33];
        return out;`);
      rows.push({ variant: name, target, mode: tag ? 'spray + TAG' : 'spray', ...r });
      console.log(JSON.stringify(rows.at(-1)));
    }
  }
}
process.exit(0);
