# The author's balance + bug pass, all runs in order (Vite :5194; Chrome :9363 restarted by chrome.sh if it died).
cd "$(dirname "$0")"
run() { bash chrome.sh; "$@"; }
run env DIFF=gentle bash l1/full.sh > /tmp/wd-diff/v4-l1-gentle.log 2>&1
run env DIFF=gentle bash l2/full.sh > /tmp/wd-diff/v4-l2-gentle.log 2>&1
run env DIFF=normal bash l1/full.sh > /tmp/wd-diff/v4-l1-normal.log 2>&1
run env DIFF=hard bash l1/full.sh > /tmp/wd-diff/v4-l1-hard.log 2>&1
run env DIFF=normal bash l1/coop-share.sh > /tmp/wd-diff/v4-coop.log 2>&1
run node repro.mjs > /tmp/wd-diff/v4-repro.log 2>&1
run node barshots.mjs > /tmp/wd-diff/v4-barshots.log 2>&1
echo ALL DONE >> /tmp/wd-diff/v4-barshots.log
