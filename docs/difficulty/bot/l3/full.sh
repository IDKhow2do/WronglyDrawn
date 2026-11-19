# Level-3 full run, all walking, no warps: fresh Limp Works → Legs → three Guardians → the Red Pen → level complete.
# Needs the no-HMR Vite on :5194 (vite.nohmr.mjs) and headless Chrome on :9363 (see ../PROGRESS.md).
set -e
cd "$(dirname "$0")"
node prep.mjs works
S=$(date +%s)
node w3bot.mjs none 3000 | grep --line-buffered -vE "^ +[0-9]+s pos"
echo "TOTAL $(( $(date +%s) - S ))s"
node probe.mjs "return [__WD.app.session.stats.time, __WD.app.session.stats.crowns, __WD.app.session.stats.totalCrowns, __WD.app.session.completed, (window.__errs||[]).slice(-5)]"
