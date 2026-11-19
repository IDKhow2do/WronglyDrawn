# Rolls WAI into the last TAG on a built dist and saves close-ups. Usage: npm run build && sh repro.sh /tmp/out
HERE=$(cd "$(dirname "$0")" && pwd)
W=$(cd "$HERE/../../../.." && pwd)
OUT=${1:-/tmp/hero-white}
CLOSE="const q=s.player.renderPos; const f=s.player.forward(); __TR.shot([q.x+f.x*2.1+f.z*0.9,q.y+1.0,q.z+f.z*2.1-f.x*0.9],[q.x,q.y+0.55,q.z],40); __TR.adv(1/60);"
CSS=beauty node "$HERE/probe.mjs" $W $OUT \
 "s.debugWarp('final'); for(let i=0;i<90;i++)__TR.adv(1/60); const P=s.pen.pos, pl=s.player; const to=P.clone().sub(pl.pos).setY(0); to.normalize(); const stand=P.clone().addScaledVector(to,-(s.pen.bigness*1.2+3.4)).setY(pl.pos.y); pl.teleport(stand); pl.faceDir(to); s.ctx.camera.yaw=pl.facing; for(let i=0;i<30;i++)__TR.adv(1/60); $CLOSE return ['before the last TAG', s.pen.state, mats().ghost]" \
 "__WD.app.camera.override=null; const log=[]; const pl=s.player; s.ctx.input.virtualDown('KeyW'); WD_AGENT.act({type:'dodge'}); for(let i=0;i<4;i++)__TR.adv(1/60); log.push(['rolling',pl.dodging,pl.model.ghost]); s.ctx.input.virtualUp('KeyW'); WD_AGENT.act({type:'interact'}); let n=0; while(!s.bossDone&&n++<400){__TR.adv(1/60);} log.push(['bossDone after frames',n,'mode',s.souls.mode,'dodging',pl.dodging,'ghost',pl.model.ghost]); return log" \
 "for(let i=0;i<240;i++)__TR.adv(1/60); $CLOSE const m=mats(); return ['4 s after the TAG', 'ghost', m.ghost, m.r.filter(x=>x.n.startsWith('tripo'))]" \
 "__WD.app.camera.override=null; let n=0; while(__WD.state!=='COMPLETE'&&n++<3000)__TR.adv(1/60); for(let i=0;i<120;i++)__TR.adv(1/60); $CLOSE const m=mats(); return ['completion screen',__WD.state,'ghost',m.ghost,m.r.filter(x=>x.n.startsWith('tripo'))]" 2>&1 | tail -20
