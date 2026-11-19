# Level-2 full run, all walking, no warps: fresh harbor → mouth/ferry/clock → Bandstand Pier → lighthouse/Hush/exit.
# Needs the no-HMR Vite on :5194 (vite.nohmr.mjs) and headless Chrome on :9363 (see PROGRESS.md).
set -e
cd "$(dirname "$0")"
node prep.mjs harbor
S=$(date +%s)
node h2bot.mjs pre --walk
echo "T+$(( $(date +%s) - S ))s before the pier"
node pier.mjs none | grep --line-buffered -vE "^ +[0-9]+s pos"
echo "T+$(( $(date +%s) - S ))s before the lighthouse"
node h2bot.mjs post --walk
echo "TOTAL $(( $(date +%s) - S ))s"
node probe.mjs "return [__WD.app.session.stats.time, __WD.app.session.stats.crowns, __WD.app.session.stats.totalCrowns, __WD.app.session.completed, (window.__errs||[]).slice(-5)]"
