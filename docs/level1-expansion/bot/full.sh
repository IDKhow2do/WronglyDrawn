set -e
node botprep.mjs
S=$(date +%s)
WALK=1 node bot.mjs eye
WALK=1 node bot.mjs mouth
echo "T+$(( $(date +%s) - S ))s before quarter"
node quarter.mjs none | grep --line-buffered -vE "^ +[0-9]+s pos"
echo "T+$(( $(date +%s) - S ))s before boss"
node boss.mjs walk | tail -9
echo "TOTAL $(( $(date +%s) - S ))s"
node probe.mjs "return [__WD.app.session.stats.time, __WD.app.session.stats.crowns, __WD.app.session.stats.totalCrowns, (window.__errs||[]).slice(-5)]"
