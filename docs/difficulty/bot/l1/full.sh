# Level-1 full run (copy of docs/level1-expansion/bot). DIFF=gentle|normal|hard picks the difficulty (default gentle).
set -e
cd "$(dirname "$0")"
node botprep.mjs
node tally.mjs install
S=$(date +%s)
WALK=1 node bot.mjs eye
WALK=1 node bot.mjs mouth
echo "T+$(( $(date +%s) - S ))s before quarter"
node quarter.mjs none | grep --line-buffered -vE "^ +[0-9]+s pos"
echo "T+$(( $(date +%s) - S ))s before boss"
node boss.mjs walk | tail -9
echo "TOTAL $(( $(date +%s) - S ))s"
node probe.mjs "const s=__WD.app.session; return {difficulty: localStorage.getItem('wd.difficulty'), time: s.stats.time, hits: s.stats.damageTaken, smudges: s.stats.smudges, crowns: s.stats.crowns, completed: s.completed, errs: (window.__errs||[]).slice(-5)}"
node tally.mjs report
