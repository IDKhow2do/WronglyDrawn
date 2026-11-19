# Gentle drift check: the Eraser fight (warp to the summit) on the current code (:5194) and on a copy of the
# pre-difficulty commit e15bbb3 (:5195, root /tmp/wd-diff/base). Usage: bash eraser-ab.sh [rounds]
cd "$(dirname "$0")"
for i in $(seq 1 ${1:-2}); do
  for port in ${PORTS:-5194 5195}; do
    PORT=$port DIFF=gentle node botprep.mjs > /dev/null
    echo "port $port round $i: $(node boss.mjs | grep "boss done" | cut -c1-200) boons $(node probe.mjs "return [...__WD.app.arsenal.boons]")"
  done
done
