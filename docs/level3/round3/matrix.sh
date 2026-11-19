# Presence matrix (docs/level3/ROUND3.md job 1): every kind × mode, 30 s of game time each, one JSON line per run.
# Retries a run (fresh page) when Chrome was killed under it. Usage: WD_VITE=5292 bash matrix.sh "snake compass" "still stroll dodge counter" [tag]
cd "$(dirname "$0")"
KINDS=${1:-"snake compass"}; MODES=${2:-"still stroll dodge counter"}; TAG=${3:-after}
for k in $KINDS; do for m in $MODES; do
  for try in 1 2 3; do
    until curl -s http://127.0.0.1:${WD_CDP:-9392}/json/version >/dev/null; do sleep 1; done
    node ../bot/prep.mjs works >/dev/null 2>&1
    out=$(node presence.mjs $k $m 30 $k-$m-$TAG 2>/dev/null | grep '^{')
    if [ -n "$out" ]; then echo "$out"; break; fi
    echo "# retry $k $m ($try)" >&2
  done
done; done
