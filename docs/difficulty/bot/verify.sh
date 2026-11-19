# Everything still unverified, in one go (Vite :5194, Chrome :9363). Logs in /tmp/wd-diff/v2-*.log
cd "$(dirname "$0")"
DIFF=gentle bash l1/full.sh > /tmp/wd-diff/v2-l1-gentle.log 2>&1
DIFF=gentle bash l2/full.sh > /tmp/wd-diff/v2-l2-gentle.log 2>&1
DIFF=gentle bash l3/full.sh > /tmp/wd-diff/v2-l3-gentle.log 2>&1
DIFF=normal bash l1/full.sh > /tmp/wd-diff/v2-l1-normal.log 2>&1
node carry.mjs > /tmp/wd-diff/v2-carry.log 2>&1
echo ALL DONE >> /tmp/wd-diff/v2-carry.log
