# The co-op partner's share of the damage: the quarter (warp 'gate') and the Eraser (summit) with Pip on.
# Usage: DIFF=normal bash coop-share.sh   (turns co-op off again at the end: it persists in localStorage)
cd "$(dirname "$0")"
node botprep.mjs
node probe.mjs "return WD_COOP.enable(true)"
sleep 4
node tally.mjs install
node quarter.mjs gate | grep --line-buffered -E "quarter cleared|STATUE|END marks" | cut -c1-120
node boss.mjs | grep "boss done" | cut -c1-120
node tally.mjs report
node probe.mjs "return WD_COOP.enable(false)"
