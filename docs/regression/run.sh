# Regression runner (docs/REGRESSION.md). Usage: bash docs/regression/run.sh l1|l2|l3 [gentle|normal] [tag]
# Needs: Vite on :5271 (npx vite --config docs/regression/vite.mjs) and headless Chrome on :9371 (docs/regression/chrome.sh).
# Logs to /tmp/wd-reg/logs/<level>-<diff>-<tag>.log; screenshots to /tmp/wd-reg/shots.
D=$(cd "$(dirname "$0")/.." && pwd)
LV=$1; DF=${2:-gentle}; TAG=${3:-1}
export WD_CDP=9371 WD_VITE=5271 PORT=5271 DIFF=$DF WD_SHOTS=/tmp/wd-reg/shots
LOG=/tmp/wd-reg/logs/$LV-$DF-$TAG.log
mkdir -p /tmp/wd-reg/logs /tmp/wd-reg/shots
{
  echo "START $(date '+%F %T') load: $(uptime | sed 's/.*load averages*: //')"
  case $LV in
    l1) bash "$D/difficulty/bot/l1/full.sh" ;;
    l2) bash "$D/level2-expansion/bot/full.sh" ;;
    l3) bash "$D/level3/bot/full.sh" ;;
  esac
  echo "EXIT $?"
  echo "END $(date '+%F %T') load: $(uptime | sed 's/.*load averages*: //')"
} > "$LOG" 2>&1
