cd "$(dirname "$0")"
node prep.mjs harbor 2>&1 | grep -v Fontconfig | tail -1
for k in 0 1; do
node probe.mjs "__WD.session.debugWarp('ferry'); const d=__WD.session.level.spots.decks; T.tp(d[$k].x, d[$k].y+0.3, d[$k].z, -Math.PI/2); return 1"
sleep 1
node probe.mjs "const d=__WD.session.level.spots.decks; WD_AGENT.act({type:'move_to',x:d[$k+1].x,z:d[$k+1].z,run:false}); return 1"
for i in 1 2 3 4 5 6; do node probe.mjs "const s=__WD.session,p=s.player; return [p.pos.toArray().map(v=>+v.toFixed(2)), p.hp, p.grounded]"; sleep 0.4; done
done
node crosstest.mjs 3 2>&1 | grep -v Fontconfig
