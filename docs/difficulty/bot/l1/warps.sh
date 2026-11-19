# Bosses on a chosen difficulty without the walk: Inkwell quarter (warp 'gate') then the Eraser (warp summit).
# Usage: DIFF=hard bash warps.sh
set -e
cd "$(dirname "$0")"
node botprep.mjs
node tally.mjs install
node quarter.mjs gate | grep --line-buffered -vE "^ +[0-9]+s pos|STUCK"
node probe.mjs "const s=__WD.app.session; return {phase:'quarter', difficulty: localStorage.getItem('wd.difficulty'), time: s.stats.time, hits: s.stats.damageTaken, smudges: s.stats.smudges}"
node boss.mjs | tail -9
node probe.mjs "const s=__WD.app.session; return {phase:'eraser', time: s.stats.time, hits: s.stats.damageTaken, smudges: s.stats.smudges, completed: s.completed}"
node tally.mjs report
