cd "$(dirname "$0")"
node probe.mjs "WD_COOP.enable(true); WD_COOP.setBrain('rule'); return WD_COOP.enabled"
node prep.mjs harbor 2>&1 | grep -v Fontconfig | tail -1
node probe.mjs "__WD.session.debugWarp('ferry'); return !!WD_COOP.partner"
sleep 5
node probe.mjs "const p=WD_COOP.partner.pip; return {pos:p.pos.toArray().map(v=>+v.toFixed(1)), tp:p.teleports}"
node crosstest.mjs 1 2>&1 | grep -v Fontconfig
node probe.mjs "WD_AGENT.act({type:'move_to',x:-24,z:14,run:false}); return 1"
for i in 1 2 3 4 5 6; do sleep 3; node probe.mjs "const p=WD_COOP.partner.pip; return {pip:p.pos.toArray().map(v=>+v.toFixed(1)), wai:__WD.session.player.pos.toArray().map(v=>+v.toFixed(1)), tp:p.teleports, at:p.teleportAt, nav:p.navStats}"; done
node probe.mjs "WD_COOP.enable(false); return 1"
